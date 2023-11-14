import { Inter } from 'next/font/google'
import './globals.css'

import Script from 'next/script'

import { ZohoProvider } from '../providers/ZohoProvider'
import RollbarProvider from '~/providers/RollbarProvider'

const inter = Inter({ subsets: ['latin'] })
const zohoSDKurl = 'https://live.zwidgets.com/js-sdk/1.2/ZohoEmbededAppSDK.min.js'

export const metadata = {
  title: 'Create Next App',
  description: 'Generated by create next app',
}


export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <RollbarProvider>
          <ZohoProvider>
            {children}
          </ZohoProvider>
          {/* eslint-disable-next-line @next/next/no-before-interactive-script-outside-document */}
          <Script
            src={zohoSDKurl}
            strategy='beforeInteractive'
          />
        </RollbarProvider>
      </body>


    </html>
  )
}
