'use server'
import prisma from '~/utils/prisma'

export const getMessages = async () => {

    console.log('getting messages')
    const { accessToken } = await prisma.account.findFirst({ where: { platform: 'zoho' }, select: { accessToken: true } })
    console.log('account', accessToken)
    return accessToken
}