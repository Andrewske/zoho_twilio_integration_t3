'use client'
import Image from 'next/image'
import styles from './page.module.css'
import { getMessages } from './actions/twilio'


import { leadPhoneNumber, studioPhoneNumber } from '~/utils/signals'


export default function Home() {

  return (
    <main className={styles.main}>
      {/* <button onClick={doSomething}>Get Messages No</button> */}
      <p>{leadPhoneNumber.value}</p>
      <p>{studioPhoneNumber.value}</p>
    </main>
  )
}
