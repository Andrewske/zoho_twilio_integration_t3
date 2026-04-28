'use server';
import { getStudioFromZohoId as _getStudioFromZohoId } from '~/utils/studio-lookups';

export async function getStudioFromZohoId(owner_id) {
  return _getStudioFromZohoId(owner_id);
}
