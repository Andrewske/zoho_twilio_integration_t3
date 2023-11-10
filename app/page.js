'use client'
import styles from './page.module.css'
import { getMessages } from '../actions/twilio'
import { useContext, useState, useEffect } from 'react'

import { ZohoContext } from '../providers/ZohoProvider'
import ChatWindow from '../components/ChatWindow'
import { Comment } from 'react-loader-spinner'


export default function Home() {
  const { leadPhoneNumber, studioPhoneNumber } = useContext(ZohoContext);
  const [messages, setMessages] = useState(null)


  useEffect(() => {
    if (leadPhoneNumber && studioPhoneNumber) {
      getMessages({ leadPhoneNumber, studioPhoneNumber }).then((messages) => {
        setMessages(messages)
      })
    }
  }, [leadPhoneNumber, studioPhoneNumber])

  return (
    <main className={styles.main}>
      {!messages ? (
        <Comment
          visible={true}
          height="80"
          width="80"
          ariaLabel="comment-loading"
          wrapperStyle={{}}
          wrapperClass="comment-wrapper"
          color="#fff"
          backgroundColor="#F4442E"
        />
      ) : (
        <ChatWindow messages={messages} />
      )}
    </main>
  )
}
