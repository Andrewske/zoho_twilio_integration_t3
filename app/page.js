import styles from './page.module.css';

import ToastContainer from '~/components/ToastContainer';
import ChatWindow from '../components/ChatWindow';
import { prisma } from '~/utils/prisma';


export default async function Home() {

  const studioPhones = await prisma.studio.findMany({
    where: {
      active: true,
    },
    select: {
      name: true,
      smsPhone: true,
    },
  });




  return (
    <main className={styles.main}>
      <ToastContainer />

      <ChatWindow
        studioPhones={studioPhones}
      />

    </main>
  );
}
