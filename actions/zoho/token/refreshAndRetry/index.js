
import { prisma } from "~/utils/prisma"
import { refreshAccessToken } from "~/actions/zoho/token"

const refreshAndRetry = async (func, props) => {
    const account = await prisma.account.findFirst({
        where: { accessToken: props.accessToken, platform: 'zoho' },
    });

    if (!account) {
        throw new Error(`No account found for access token ${props.accessToken}`);
    }

    const updatedAccount = await refreshAccessToken(account);
    console.log('refreshAndRetry', { oldToken: props.account.accessToken })
    console.log('refreshAndRetry', { newToken: updatedAccount.accessToken })


    props.account.accessToken = updatedAccount.accessToken;

    return func(props);
}

export default refreshAndRetry;