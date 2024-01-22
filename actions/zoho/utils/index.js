'use server';

export const isAccessTokenExpired = (account) => {
  const { updatedAt, expiresIn } = account;
  const updatedAtDate = new Date(updatedAt);
  updatedAtDate.setUTCSeconds(updatedAtDate.getUTCSeconds() + expiresIn);
  return updatedAtDate < new Date(Date.now());
};
