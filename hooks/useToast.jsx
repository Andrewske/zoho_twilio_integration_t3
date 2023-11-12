'use client';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const useToast = () => {
  const sendError = (message, options = {}) => {
    toast.error(message, options);
  };

  const sendSuccess = (message = null, options = {}) => {
    toast.success(message ?? 'Message sent!', options);
  };

  const createContainer = () => {
    return (
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
      />
    );
  };

  return {
    container: () => createContainer(),
    sendError,
    sendSuccess,
  };
};

export default useToast;
