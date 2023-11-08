'use client'
import Image from 'next/image'
import styles from './page.module.css'
import { getMessages } from './actions/twilio'
import { useState } from 'react'

export default function Home() {
  const [data, setData] = useState('')
  async function doSomething() {
    const res = await getMessages()
    setData(res)
  }
  return (
    <main className={styles.main}>
      <button onClick={doSomething}>Get Messages</button>
      <p>{data}</p>
    </main>
  )
}
