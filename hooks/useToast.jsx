import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const useToast = () => {
  const sendError = (message) => {
    toast.error(message);
  };

  const sendSuccess = () => {
    toast.success('Message sent!');
  };

  const createContainer = () => {
    return (
      <ToastContainer
        position="top-right"
        autoClose={5000}
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
