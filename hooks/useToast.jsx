'use client';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const useToast = () => {
  const sendError = (message, autoClose = 3000) => {
    toast.error(message, { autoClose });
  };

  const sendSuccess = (message = null, autoClose = 3000) => {
    toast.success(message ?? 'Message sent!', { autoClose });
  };
  return {
    sendError,
    sendSuccess,
  };
};

export default useToast;
