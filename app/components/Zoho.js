'use client'
import Script from 'next/script'
import { useEffect, useState } from 'react'
import { getMessages } from '../actions/twilio'
const zohoSDKurl = 'https://live.zwidgets.com/js-sdk/1.2/ZohoEmbededAppSDK.min.js'


const Zoho = ({ children }) => {
    useEffect(() => {
        console.log('loadZohoData');
        const handlePageLoad = (data) => {
            if (data?.Entity) {
                ZOHO.CRM.API.getRecord({
                    Entity: data.Entity,
                    RecordID: data.EntityId,
                }).then((response) => {
                    console.log('response', response);
                    const description = response?.data[0]?.Description;
                    const phone = response?.data[0]?.Phone;
                    console.log('phone', phone);
                    console.log('description', description);
                    // if (phone) {
                    //     setLeadPhoneNumber(phone);
                    // } else if (description) {
                    //     const { to, from } = parseDescription(description);
                    //     setLeadPhoneNumber(to);
                    //     setUserPhoneNumber(from);
                    // } else {
                    //     console.log("Couldn't find the lead's phone number")
                    // }
                    getMessages()
                });
            }

            ZOHO.CRM.CONFIG.getCurrentUser().then((response) => {
                console.log('current user', response);
                // setUserPhoneNumber(response?.users[0]?.phone);
            });
        };

        ZOHO.embeddedApp.on('PageLoad', handlePageLoad);
        ZOHO.embeddedApp.init();
    }, [])

    return <>
        {/* eslint-disable-next-line @next/next/no-before-interactive-script-outside-document */}
        <Script
            src={zohoSDKurl}
            strategy="beforeInteractive"
        />
        {children}
    </>
}

export default Zoho