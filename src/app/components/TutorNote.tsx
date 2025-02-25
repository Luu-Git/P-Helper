import { useState } from 'react';
import { doc, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';

interface Note {
  content: string;
  tutorId: string;
  tutorName: string;
  timestamp: Date;
  columnIndex: number;
}

interface Student {
  id: string;
  notes?: {
    [columnIndex: number]: Note[];
  };
}

interface TutorNoteProps {
  studentId: string;
  columnIndex: number;
  onNoteAdded?: () => void;
}

export default function TutorNote({ studentId, columnIndex, onNoteAdded }: TutorNoteProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const { user } = useAuth();

  const handleAddNote = async () => {
    if (!user || !noteContent.trim()) return;

    try {
      const studentRef = doc(db, 'students', studentId);
      const studentDoc = await getDoc(studentRef);
      
      if (!studentDoc.exists()) {
        console.error('Student not found');
        return;
      }

      const student = studentDoc.data() as Student;
      const newNote: Note = {
        content: noteContent.trim(),
        tutorId: user.uid,
        tutorName: user.displayName || user.email || 'Unknown Tutor',
        timestamp: new Date(),
        columnIndex
      };

      // Update the notes array for the specific column
      await updateDoc(studentRef, {
        [`notes.${columnIndex}`]: arrayUnion(newNote)
      });

      setNoteContent('');
      setIsAdding(false);
      onNoteAdded?.();
    } catch (error) {
      console.error('Error adding note:', error);
    }
  };

  return (
    <div className="p-2">
      {isAdding ? (
        <div className="space-y-2">
          <textarea
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            className="w-full p-2 border rounded-md focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="Add your note here..."
            rows={3}
            autoFocus
          />
          <div className="flex justify-end space-x-2">
            <button
              onClick={handleAddNote}
              className="px-3 py-1 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm"
            >
              Save
            </button>
            <button
              onClick={() => {
                setIsAdding(false);
                setNoteContent('');
              }}
              className="px-3 py-1 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="text-indigo-600 hover:text-indigo-800 text-sm"
        >
          + Add Note
        </button>
      )}
    </div>
  );
} 