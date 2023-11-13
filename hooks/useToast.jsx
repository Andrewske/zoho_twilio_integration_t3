'use client';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const useToast = () => {
  const sendError = (message, autoClose = 3000) => {
    toast.error(message, { autoClose });
  };

  const sendSuccess = (message = null, autoClose = 3000) => {
    toast.success(message ?? 'Message sent!', { autoClose });
  };

  const createContainer = () => {
    return (
      <ToastContainer
        position="bottom-left"
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
