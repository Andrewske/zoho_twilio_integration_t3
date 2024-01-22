
import { prisma } from "~/utils/prisma"
import { refreshAccessToken } from "~/actions/zoho/token"

const refreshAndRetry = async (func, accessToken) => {
    const account = await prisma.account.findFirst({
        where: { accessToken, platform: 'zoho' },
    });

    if (!account) {
        throw new Error('No account found for access token');
    }

    const updatedAccessToken = await refreshAccessToken(account);


    return func(updatedAccessToken);
}

export default refreshAndRetry;