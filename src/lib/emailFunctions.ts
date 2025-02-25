import { db } from './firebase';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

interface AcknowledgmentEmailData {
  professorEmail: string;
  tutorName: string;
  timeSlots: {
    date: Timestamp;
    start: string;
    end: string;
  }[];
}

export const sendAcknowledgmentEmail = async (data: AcknowledgmentEmailData) => {
  try {
    console.log('Sending acknowledgment email with data:', {
      to: data.professorEmail,
      tutorName: data.tutorName,
      timeSlots: data.timeSlots.length
    });
    
    if (!data.professorEmail) {
      console.error('Missing professor email address');
      return { 
        success: false, 
        error: 'Professor email address is required'
      };
    }
    
    // Get a reference to the Cloud Function
    const sendEmail = httpsCallable(functions, 'sendAcknowledgmentEmail');
    
    // Prepare the data for the function call
    const functionData = {
      to: data.professorEmail,
      tutorName: data.tutorName,
      timeSlots: data.timeSlots.map(slot => ({
        date: slot.date.toDate().toLocaleDateString(),
        start: slot.start,
        end: slot.end
      }))
    };
    
    console.log('Calling Cloud Function with data:', functionData);
    
    // Call the Cloud Function
    const result = await sendEmail(functionData);
    
    console.log('Email function result:', result.data);
    return { 
      success: true,
      data: result.data
    };
  } catch (error) {
    console.error('Error sending acknowledgment email:', error);
    
    // Log more detailed error information
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    
    // Return error object instead of throwing
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}; 