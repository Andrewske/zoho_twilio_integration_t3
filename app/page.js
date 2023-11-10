'use client'
import styles from './page.module.css'
import { getMessages } from '../actions/twilio'
import { useContext, useState, useEffect } from 'react'

import { ZohoContext } from '../providers/ZohoProvider'
import ChatWindow from '../components/ChatWindow'
import { Comment } from 'react-loader-spinner'
import useToast from '~/hooks/useToast'



export default function Home() {
  const { leadPhoneNumber, studioPhoneNumber } = useContext(ZohoContext);
  const [messages, setMessages] = useState(null)
  const toast = useToast();
  const { container: ToastContainer } = toast;


  useEffect(() => {
    if (leadPhoneNumber && studioPhoneNumber) {
      getMessages({ leadPhoneNumber, studioPhoneNumber }).then((messages) => {
        setMessages(messages)
      })
    }
  }, [leadPhoneNumber, studioPhoneNumber])

  return (
    <main className={styles.main}>
      <ToastContainer />
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
        <ChatWindow leadPhoneNumber={leadPhoneNumber} studioPhoneNumber={studioPhoneNumber} messages={messages} toast={toast} />
      )}
    </main>
  )
}
