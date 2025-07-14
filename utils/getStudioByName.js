import { prisma } from './prisma.js';

/**
 * Get studio ID by name
 * @param {string} studioName - Studio name
 * @returns {Promise<string|null>} Studio ID or null if not found
 */
export async function getStudioIdByName(studioName) {
  try {
    const studio = await prisma.studio.findFirst({
      where: { name: studioName },
      select: { id: true }
    });
    
    return studio?.id || null;
  } catch (error) {
    console.error('Error getting studio by name:', error);
    return null;
  }
}

/**
 * Get philip_admin studio ID
 * @returns {Promise<string|null>} Philip admin studio ID
 */
export async function getPhilipAdminStudioId() {
  return await getStudioIdByName('philip_admin');
}