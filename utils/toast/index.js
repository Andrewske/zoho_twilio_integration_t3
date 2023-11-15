import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';


export const sendError = (message, autoClose = 3000) => {
    toast.error(message, { autoClose });
};

export const sendSuccess = (message = null, autoClose = 3000) => {
    toast.success(message ?? 'Message sent!', { autoClose });
};