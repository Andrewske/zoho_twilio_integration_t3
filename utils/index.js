export const formatMobile = (mobile) => {
  try {
    // Remove all non-digit characters
    const digitsOnly = mobile.replace(/\D/g, '');

    // Trim any leading or trailing whitespace
    const trimmed = digitsOnly.trim();

    // Return the last 10 characters
    const lastTenDigits = trimmed.slice(-10);

    return lastTenDigits;
  } catch {
    // If any error occurs, return null
    return null;
  }
};
