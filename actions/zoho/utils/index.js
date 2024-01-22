'use server';
export const isAccessTokenExpired = (account) => {
  const { updatedAt, expiresIn } = account;
  const updatedAtDate = new Date(updatedAt);
  updatedAtDate.setTime(updatedAtDate.getTime() + expiresIn * 1000);
  return updatedAtDate < new Date(Date.now());
};
