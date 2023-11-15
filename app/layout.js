import { Inter } from 'next/font/google'
import '~/styles/globals.css'

import Script from 'next/script'

import { ZohoProvider } from '../providers/ZohoProvider'

const inter = Inter({ subsets: ['latin'] })
const zohoSDKurl = 'https://live.zwidgets.com/js-sdk/1.2/ZohoEmbededAppSDK.min.js'

export const metadata = {
  title: 'Twilio Zoho Integration',
  description: 'A Zoho extension that provides SMS messaging with leads through Twilio',
}


export default function RootLayout({ children }) {

  return (
    <html lang="en">
      <body className={inter.className}>

        <ZohoProvider>
          {children}
        </ZohoProvider>
        {/* eslint-disable-next-line @next/next/no-before-interactive-script-outside-document */}
        <Script
          src={zohoSDKurl}
          strategy='beforeInteractive'
        />
      </body>
    </html>
  )
}
