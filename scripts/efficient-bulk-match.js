#!/usr/bin/env node

/**
 * Efficient bulk matching using the original JSON data
 * 
 * Usage: 
 * node scripts/efficient-bulk-match.js path/to/zoho-tasks.json [--test]
 */

import { prisma } from '../utils/prisma.js';
import { formatMobile } from '../utils/index.js';
import fs from 'fs';

// Parse command line arguments
const args = process.argv.slice(2);
const testMode = args.includes('--test');
const filename = args.find(arg => !arg.startsWith('--'));

if (!filename) {
  console.error('❌ Please provide the path to the Zoho tasks JSON file');
  console.error('Usage: node scripts/efficient-bulk-match.js path/to/zoho-tasks.json [--test]');
  process.exit(1);
}

console.log(`🚀 Starting efficient bulk message matching ${testMode ? '(TEST MODE)' : ''}`);

/**
 * Parse task description to extract TO, FROM, MSG
 */
function parseTaskDescription(description) {
  const toMatch = description.match(/TO:\s*([^\s]+)/);
  const fromMatch = description.match(/FROM:\s*([^\s]+)/);
  const msgMatch = description.match(/MSG:\s*(.+)$/);

  if (!toMatch || !fromMatch || !msgMatch) {
    return null;
  }

  return {
    to: formatMobile(toMatch[1]),
    from: formatMobile(fromMatch[1]),
    msg: msgMatch[1].trim()
  };
}

/**
 * Normalize message text for matching by replacing emojis with ?
 * This handles the case where database has emojis but Zoho exports show ?
 */
function normalizeForMatching(text) {
  if (!text) return text;
  
  // Replace any character above ASCII range (which includes emojis) with ?
  // This catches emojis, special symbols, and other Unicode characters that Zoho converts to ?
  return text.replace(/[^\x00-\x7F]/g, '?');
}

/**
 * Calculate similarity score between two strings using Levenshtein distance
 * Returns a score between 0 and 1, where 1 is identical and 0 is completely different
 */
function stringSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;
  
  const len1 = str1.length;
  const len2 = str2.length;
  
  // If one string is much longer than the other, lower the similarity
  if (Math.abs(len1 - len2) > Math.max(len1, len2) * 0.5) {
    return 0;
  }
  
  // Create matrix for dynamic programming
  const matrix = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(null));
  
  // Initialize first row and column
  for (let i = 0; i <= len1; i++) matrix[0][i] = i;
  for (let j = 0; j <= len2; j++) matrix[j][0] = j;
  
  // Fill the matrix
  for (let j = 1; j <= len2; j++) {
    for (let i = 1; i <= len1; i++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j - 1][i] + 1,     // deletion
        matrix[j][i - 1] + 1,     // insertion
        matrix[j - 1][i - 1] + cost // substitution
      );
    }
  }
  
  const distance = matrix[len2][len1];
  const maxLength = Math.max(len1, len2);
  
  // Convert distance to similarity score (0-1)
  return 1 - (distance / maxLength);
}

/**
 * Find best matching message using similarity scoring
 * Returns the best match if similarity is above threshold, null otherwise
 */
function findBestMatch(taskMsg, candidateMessages, threshold = 0.8) {
  let bestMatch = null;
  let bestScore = 0;
  
  for (const message of candidateMessages) {
    if (!message.message) continue;
    
    // Normalize both messages for comparison
    const normalizedTask = normalizeForMatching(taskMsg);
    const normalizedMessage = normalizeForMatching(message.message);
    
    const similarity = stringSimilarity(normalizedTask, normalizedMessage);
    
    if (similarity > bestScore && similarity >= threshold) {
      bestScore = similarity;
      bestMatch = { ...message, similarityScore: similarity };
    }
  }
  
  return bestMatch;
}

/**
 * Efficient bulk matching using batch queries
 */
async function efficientBulkMatch(tasks) {
  console.log(`🔍 Processing ${tasks.length} tasks for message matching...`);
  
  // Step 1: Parse all task descriptions and group by studio
  // const tasksByStudio = new Map();
  const parsedTasks = [];
  
  for (const task of tasks) {
    const parsed = parseTaskDescription(task.Description);
    if (parsed) {
      const taskInfo = {
        zohoTaskId: task.id,
        studioId: task.studioId,
        createdAt: task.Created_Time, // Add the Created_Time as createdAt
        ...parsed,
        firstChars: parsed.msg.substring(0, 50),
      };
      
      parsedTasks.push(taskInfo);
      
      // if (!tasksByStudio.has(task.studioId)) {
      //   tasksByStudio.set(task.studioId, []);
      // }
      // tasksByStudio.get(task.studioId).push(taskInfo);
    }
  }
  
  console.log(`📊 Parsed ${parsedTasks.length} tasks with valid descriptions`);
  // console.log(`🏢 Grouped across ${tasksByStudio.size} studios`);
  
  // if (testMode) {
  //   console.log('🧪 Test mode - would process matches by studio');
  //   return { matched: 0, updated: 0 };
  // }
  
  let totalMatched = 0;
  let totalUpdated = 0;

  const existingMatches = await prisma.zohoTask.findMany({
    where: {
      messageId: {
        not: null,
      },
    },
    select: {
      messageId: true,
      zohoTaskId: true
    },
  });

  const existingMatchesMap = existingMatches.map(match => match.zohoTaskId);

  const tasksToProcess = parsedTasks.filter(task => !existingMatchesMap.includes(task.zohoTaskId));

  console.log(`🔍 Found ${existingMatches.length} existing matches`);


  const messages = await prisma.message.findMany({
    where: {
      // Find all messages where the message id is not in ZohoTask (where ZohoTask.messageId is not null)
      id: {
        notIn: existingMatches.map(match => match.messageId),
      }
    },
  });

  const normalizedMessages = messages.map(message => ({
    ...message,
    message: normalizeForMatching(message.message),
  }));

  const zohoVoice = await prisma.studio.findMany({
    where: {
      zohoVoicePhone: {
        not: null,
      }
    },
    select: {
      zohoVoicePhone: true,
    },
  });

  const zohoVoiceNumbers = zohoVoice.map(studio => studio.zohoVoicePhone);

  const matchedMessages = [];

  const multipleMessages = [];

  const noMatch = [];

  const notZohoVoice = tasksToProcess.filter(task => !zohoVoiceNumbers.includes(task.from) && !zohoVoiceNumbers.includes(task.to));

  
  console.log(`🔍 Processing ${notZohoVoice.length} tasks`);
  for (const task of notZohoVoice) {

    const taskMessages = normalizedMessages.filter(message => message.fromNumber === task.from && message.toNumber === task.to);

    const matches = taskMessages.map(message => ({
      ...message,
      similarityScore: stringSimilarity(message.message, task.msg)
    }));

    if (matches.length == 0) {
      noMatch.push(task);
      continue;
    }

    const bestMatch = matches.reduce((best, current) => current.similarityScore > best.similarityScore ? current : best);

    if (task.zohoTaskId == "5114699000127707051") {
      console.log("Task: ", task);
      console.log("Matches: ", matches.length);
      console.log("Best Match: ", bestMatch);
    }

    if (bestMatch) {
      matchedMessages.push({
        zohoTaskId: task.zohoTaskId,
        messageId: bestMatch.id,
        contactId: bestMatch.contactId,
      });
      totalMatched++;
    } else {
      noMatch.push(task);
    }
  }

  console.log(noMatch.slice(0, 5));
  console.log("No matches found:", noMatch.length);

  if (noMatch.length > 0) {
    const minDateNoMatch = noMatch.reduce((min, current) => current.createdAt < min.createdAt ? current : min);
    console.log("Min Date No Match: ", new Date(minDateNoMatch.createdAt).toISOString());
    const maxDateNoMatch = noMatch.reduce((max, current) => current.createdAt > max.createdAt ? current : max);
    console.log("Max Date No Match: ", new Date(maxDateNoMatch.createdAt).toISOString());
  } else {
    console.log("No unmatched tasks to analyze dates for");
  }

  // Step 4: Bulk update ZohoTask records
  if (matchedMessages.length > 0) {
    const BATCH_SIZE = 100;
    for (let i = 0; i < matchedMessages.length; i += BATCH_SIZE) {
      const batch = matchedMessages.slice(i, i + BATCH_SIZE);
      
      // Execute batch updates
      await Promise.all(batch.map(update => 
        prisma.zohoTask.update({
          where: { zohoTaskId: update.zohoTaskId, messageId: null },
          data: {
            messageId: update.messageId,
            contactId: update.contactId,
          },
        })
      ));
      
      totalUpdated += batch.length;
    }
  }



  
  // // Step 2: Process each studio's tasks in batches
  // for (const [studioId, studioTasks] of tasksByStudio) {
  //   console.log(`\n🏢 Processing ${studioTasks.length} tasks for studio ${studioId}`);
    
  //   // Get all potential phone number combinations for this studio
  //   const phoneNumbers = new Set();
  //   studioTasks.forEach(task => {
  //     phoneNumbers.add(task.from);
  //     phoneNumbers.add(task.to);
  //   });
    
  //   console.log(`   📞 Found ${phoneNumbers.size} unique phone numbers`);
    
  //   // Batch query all messages for this studio with these phone numbers
  //   const messages = await prisma.message.findMany({
  //     where: {
  //       studioId: studioId,
  //       OR: [
  //         { fromNumber: { in: Array.from(phoneNumbers) } },
  //         { toNumber: { in: Array.from(phoneNumbers) } }
  //       ]
  //     },
  //     select: {
  //       id: true,
  //       contactId: true,
  //       fromNumber: true,
  //       toNumber: true,
  //       message: true,
  //       createdAt: true,
  //     },
  //     orderBy: {
  //       createdAt: 'desc',
  //     },
  //   });
    
  //   console.log(`   📨 Found ${messages.length} potential matching messages`);
    
  //   // Step 3: Match tasks with messages efficiently
  //   const updates = [];
    
  //   for (const task of studioTasks) {
  //     // Find messages that match phone numbers
  //     const candidateMessages = messages.filter(msg => 
  //       msg.fromNumber === task.from && msg.toNumber === task.to
  //     );
      
  //     let bestMatch = null;
      
  //     // Try exact match first
  //     for (const msg of candidateMessages) {
  //       if (msg.message === task.msg) {
  //         bestMatch = msg;
  //         break;
  //       }
  //     }
      
  //     // If no exact match, try partial match (first 50 characters)
  //     if (!bestMatch && task.firstChars.length >= 20) {
  //       for (const msg of candidateMessages) {
  //         if (msg.message && msg.message.startsWith(task.firstChars)) {
  //           bestMatch = msg;
  //           break;
  //         }
  //       }
  //     }
      
  //     // If still no match, try contains match
  //     if (!bestMatch && task.firstChars.length >= 20) {
  //       for (const msg of candidateMessages) {
  //         if (msg.message && msg.message.includes(task.firstChars)) {
  //           bestMatch = msg;
  //           break;
  //         }
  //       }
  //     }
      
  //     if (bestMatch) {
  //       updates.push({
  //         zohoTaskId: task.zohoTaskId,
  //         messageId: bestMatch.id,
  //         contactId: bestMatch.contactId,
  //       });
  //       totalMatched++;
  //     }
  //   }
    
  //   console.log(`   ✅ Found ${updates.length} matches for this studio`);
    
  //   // Step 4: Bulk update ZohoTask records
  //   if (updates.length > 0) {
  //     const BATCH_SIZE = 100;
  //     for (let i = 0; i < updates.length; i += BATCH_SIZE) {
  //       const batch = updates.slice(i, i + BATCH_SIZE);
        
  //       // Execute batch updates
  //       await Promise.all(batch.map(update => 
  //         prisma.zohoTask.update({
  //           where: { zohoTaskId: update.zohoTaskId },
  //           data: {
  //             messageId: update.messageId,
  //             contactId: update.contactId,
  //           },
  //         })
  //       ));
        
  //       totalUpdated += batch.length;
  //     }
  //   }
  // }
  
  return { matched: totalMatched, updated: totalUpdated };
}

/**
 * Main function
 */
async function main() {
  try {
    const startTime = Date.now();
    
    // Read and parse the JSON file
    console.log(`📖 Reading tasks from: ${filename}`);
    const fileContent = fs.readFileSync(filename, 'utf8');
    const data = JSON.parse(fileContent);
    
    console.log(`📊 File contains ${data.totalTasks} tasks`);
    console.log(`📅 Tasks were fetched at: ${data.fetchedAt}`);
    
    if (testMode) {
      console.log('🧪 Running in test mode');
      data.tasks = data.tasks.slice(0, 100); // Test with first 100 tasks
    }
    
    // Process bulk matching
    const results = await efficientBulkMatch(data.tasks);
    
    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);
    
    console.log('\n📈 Final Results:');
    console.log(`   🔗 Matched: ${results.matched} tasks with messages`);
    console.log(`   📝 Updated: ${results.updated} ZohoTask records`);
    console.log(`   ⏱️  Duration: ${duration} seconds`);
    
    if (testMode) {
      console.log('\n🧪 Test mode completed');
      console.log('   Run without --test flag to perform actual matching');
    } else {
      console.log(`\n✅ Efficient bulk matching completed!`);
    }
    
  } catch (error) {
    console.error('💥 Script failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);