#!/usr/bin/env node

/**
 * Efficient script to fetch Zoho tasks using shared credentials
 * Uses one studio's credentials to get all tasks, then distributes to correct studios
 */

import { prisma } from '../utils/prisma.js';
import { getZohoAccount } from '../actions/zoho/index.js';
import { logError } from '../utils/logError/index.js';
import fs from 'fs';

const ZOHO_API_DELAY = 2000; // 2 second delay between API calls
const SHARED_CREDENTIALS_STUDIO_ID = 'b2395e84-3a4b-4792-a67b-57ddb8d7e744'; // philip_admin

/**
 * Fetch all tasks using shared credentials
 */
async function fetchAllTasksWithSharedCredentials() {
  console.log('📡 Fetching all tasks using shared credentials...');
  
  try {
    const { apiDomain, accessToken } = await getZohoAccount({ studioId: SHARED_CREDENTIALS_STUDIO_ID });
    
    let allTasks = [];
    let pageToken = null;
    let hasMoreRecords = true;
    let pageCount = 0;
    
    while (hasMoreRecords) {
      const url = `${apiDomain}/crm/v5/Tasks`;
      const params = new URLSearchParams({
        'per_page': '200',
        'fields': 'id,Subject,Description,Status,Created_Time,Owner,Modified_Time',
        'sort_by': 'Created_Time',
        'sort_order': 'desc'
      });

      // Add page token if we have one (for pagination beyond 2000 records)
      if (pageToken) {
        params.append('page_token', pageToken);
      }

      pageCount++;
      console.log(`   📄 Fetching page ${pageCount}${pageToken ? ' (using page_token)' : ''}...`);

      const response = await fetch(`${url}?${params}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 429) {
          // Rate limit hit - wait and retry
          console.log(`   ⏳ Rate limit hit (429), waiting 60 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 60000));
          continue; // Retry the same page
        } else {
          const errorText = await response.text();
          throw new Error(`Zoho API error: ${response.status} ${response.statusText}\nResponse: ${errorText}`);
        }
      }

      const data = await response.json();
      const tasks = data.data || [];
      
      // Filter only SMS tasks (regardless of owner - we'll sort by owner later)
      const smsTasksFromThisPage = tasks.filter(task => {
        const hasSmsPattern = task.Description && task.Description.includes('TO:') && task.Description.includes('FROM:') && task.Description.includes('MSG:');
        return hasSmsPattern;
      });

      allTasks.push(...smsTasksFromThisPage);
      
      console.log(`   📊 Page ${pageCount}: Found ${smsTasksFromThisPage.length} SMS tasks (${tasks.length} total tasks)`);

      // Check if there are more pages
      const info = data.info || {};
      hasMoreRecords = info.more_records === true;
      pageToken = info.next_page_token || null;

      // Add delay between API calls
      if (hasMoreRecords) {
        await new Promise(resolve => setTimeout(resolve, ZOHO_API_DELAY));
      }
    }

    console.log(`   ✅ Total SMS tasks found: ${allTasks.length}`);
    return allTasks;
    
  } catch (error) {
    logError({
      message: 'Error fetching Zoho tasks with shared credentials:',
      error,
      data: { studioId: SHARED_CREDENTIALS_STUDIO_ID },
    });
    console.log(`   ❌ Error fetching tasks: ${error.message}`);
    throw error;
  }
}

/**
 * Distribute tasks to correct studios based on owner
 */
async function distributeTasksToStudios(allTasks) {
  console.log('\n🏢 Distributing tasks to correct studios...');
  
  // Get all studios with their Zoho IDs
  const studios = await prisma.studio.findMany({
    where: {
      active: true,
      zohoId: { not: "" },
    },
    select: {
      id: true,
      name: true,
      zohoId: true,
    },
  });

  console.log(`   📊 Found ${studios.length} active studios`);

  // Create a map of zohoId -> studio info
  const zohoIdToStudio = new Map();
  studios.forEach(studio => {
    zohoIdToStudio.set(studio.zohoId, studio);
  });

  // Distribute tasks to studios
  let tasksWithStudioInfo = [];
  let unassignedTasks = [];

  for (const task of allTasks) {
    const ownerId = task.Owner?.id;
    const studio = zohoIdToStudio.get(ownerId);
    
    if (studio) {
      tasksWithStudioInfo.push({
        ...task,
        studioId: studio.id,
        studioName: studio.name,
        studioZohoId: studio.zohoId
      });
    } else {
      unassignedTasks.push(task);
    }
  }

  console.log(`   ✅ Assigned ${tasksWithStudioInfo.length} tasks to studios`);
  console.log(`   ⚠️  ${unassignedTasks.length} tasks could not be assigned to studios`);

  // Show breakdown by studio
  const tasksByStudio = new Map();
  tasksWithStudioInfo.forEach(task => {
    const count = tasksByStudio.get(task.studioName) || 0;
    tasksByStudio.set(task.studioName, count + 1);
  });

  console.log('\n📈 Tasks by studio:');
  for (const [studioName, count] of tasksByStudio) {
    console.log(`   ${studioName}: ${count} tasks`);
  }

  if (unassignedTasks.length > 0) {
    console.log('\n⚠️  Unassigned task owners:');
    const unassignedOwners = new Set(unassignedTasks.map(t => t.Owner?.id).filter(Boolean));
    unassignedOwners.forEach(ownerId => {
      const taskCount = unassignedTasks.filter(t => t.Owner?.id === ownerId).length;
      console.log(`   Owner ID ${ownerId}: ${taskCount} tasks`);
    });
  }

  return tasksWithStudioInfo;
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('🚀 Starting efficient Zoho task fetch process...');
    
    // Fetch all tasks using shared credentials
    const allTasks = await fetchAllTasksWithSharedCredentials();
    
    // Distribute tasks to correct studios
    const tasksWithStudioInfo = await distributeTasksToStudios(allTasks);
    
    console.log(`\n📊 Total tasks processed: ${tasksWithStudioInfo.length}`);
    
    // Save to JSON file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `./scripts/zoho-tasks-shared-${timestamp}.json`;
    
    const dataToSave = {
      fetchedAt: new Date().toISOString(),
      totalTasks: tasksWithStudioInfo.length,
      fetchMethod: 'shared-credentials',
      sharedCredentialsStudioId: SHARED_CREDENTIALS_STUDIO_ID,
      tasks: tasksWithStudioInfo
    };
    
    fs.writeFileSync(filename, JSON.stringify(dataToSave, null, 2));
    
    console.log(`💾 Tasks saved to: ${filename}`);
    console.log(`\nNext step: Run the matching script with:`);
    console.log(`node scripts/match-zoho-tasks.js ${filename}`);
    
  } catch (error) {
    console.error('💥 Script failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);