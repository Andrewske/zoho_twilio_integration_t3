'use server';

export const isAccessTokenExpired = (account) => {
  const { updatedAt, expiresIn } = account;
  const updatedAtDate = new Date(updatedAt);
  console.log(expiresIn)
  console.log('updatedAtDate', updatedAtDate, updatedAtDate.getTime() + expiresIn * 1000)
  updatedAtDate.setTime(updatedAtDate.getTime() + expiresIn * 1000);
  console.log('updatedAtDate', updatedAtDate, new Date(Date.now()))
  return updatedAtDate < new Date(Date.now());
};
