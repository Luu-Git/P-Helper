import { useState, Fragment, useRef } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { writeBatch, collection, doc, Firestore } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { XMarkIcon, TrashIcon } from '@heroicons/react/24/outline';
import * as XLSX from 'xlsx';

interface ExcelImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  professorId: string;
  onSuccess: (count: number) => void;
}

interface StudentData {
  firstName?: string;
  lastName?: string;
  [key: string]: string | undefined;
}

const ExcelImportDialog = ({ isOpen, onClose, professorId, onSuccess }: ExcelImportDialogProps) => {
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'complete'>('upload');
  const [excelData, setExcelData] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importResults, setImportResults] = useState<{ success: number; failed: number }>({ success: 0, failed: 0 });
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Constants for column mapping
  const FIRST_NAME_COLUMN = 'A';
  const LAST_NAME_COLUMN = 'B';

  const resetState = () => {
    setStep('upload');
    setExcelData([]);
    setError(null);
    setImportResults({ success: 0, failed: 0 });
    setProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const processExcelFile = (file: File) => {
    setError(null);
    
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setError('Please upload an Excel file (.xlsx or .xls)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 'A' }) as Record<string, any>[];
        
        if (jsonData.length <= 1) { // Only header row or empty
          setError('The Excel file is empty or contains only headers');
          return;
        }

        // Remove the header row
        const dataWithoutHeader = jsonData.slice(1);
        
        // Validate that the required columns exist
        const hasFirstNameColumn = dataWithoutHeader.some(row => FIRST_NAME_COLUMN in row);
        const hasLastNameColumn = dataWithoutHeader.some(row => LAST_NAME_COLUMN in row);
        
        if (!hasFirstNameColumn || !hasLastNameColumn) {
          setError(`The Excel file must have data in columns A (First Name) and B (Last Name)`);
          return;
        }
        
        setExcelData(dataWithoutHeader);
        setStep('preview');
      } catch (err) {
        console.error('Error processing Excel file:', err);
        setError('Failed to process the Excel file. Please make sure it&apos;s a valid Excel file.');
      }
    };
    
    reader.onerror = () => {
      setError('Error reading the file');
    };
    
    reader.readAsBinaryString(file);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processExcelFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropZoneRef.current) {
      dropZoneRef.current.classList.add('border-indigo-500');
      dropZoneRef.current.classList.add('bg-indigo-50');
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropZoneRef.current) {
      dropZoneRef.current.classList.remove('border-indigo-500');
      dropZoneRef.current.classList.remove('bg-indigo-50');
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (dropZoneRef.current) {
      dropZoneRef.current.classList.remove('border-indigo-500');
      dropZoneRef.current.classList.remove('bg-indigo-50');
    }
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      processExcelFile(file);
    }
  };

  // Extract first name (only the first part if multiple names)
  const extractFirstName = (fullName: string): string => {
    if (!fullName) return '';
    return fullName.split(' ')[0].trim();
  };

  // Remove a student from the preview list
  const handleRemoveStudent = (index: number) => {
    setExcelData(prevData => prevData.filter((_, i) => i !== index));
  };

  const handleImport = async () => {
    setStep('importing');
    setProgress(0);
    setError(null);

    try {
      let batchInstance = writeBatch(db);
      let count = 0;
      let successCount = 0;
      let failedCount = 0;
      let batches = [];

      // Process students in batches of 500 (Firestore limit)
      for (let i = 0; i < excelData.length; i++) {
        const student = excelData[i];
        const firstName = extractFirstName(student[FIRST_NAME_COLUMN]?.toString() || '');
        const lastName = student[LAST_NAME_COLUMN]?.toString()?.trim() || '';
        
        if (!firstName || !lastName) {
          failedCount++;
          continue;
        }

        const fullName = `${firstName} ${lastName}`;

        const docRef = doc(collection(db, 'students'));
        batchInstance.set(docRef, {
          name: fullName,
          professorId,
          attendance: 0,
          createdAt: new Date(),
        });
        
        count++;
        successCount++;
        
        // Firestore has a limit of 500 operations per batch
        if (count === 500 || i === excelData.length - 1) {
          batches.push(batchInstance.commit());
          batchInstance = writeBatch(db);
          count = 0;
        }
        
        // Update progress
        setProgress(Math.round(((i + 1) / excelData.length) * 100));
      }
      
      if (count > 0) {
        batches.push(batchInstance.commit());
      }
      
      await Promise.all(batches);
      
      setImportResults({ success: successCount, failed: failedCount });
      setStep('complete');
      onSuccess(successCount);
    } catch (err) {
      console.error('Error importing students:', err);
      setError('Failed to import students. Please try again.');
      setStep('preview');
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-10" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <div className="flex justify-between items-center">
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-medium leading-6 text-gray-900"
                  >
                    {step === 'upload' && 'Import Students from Excel'}
                    {step === 'preview' && 'Preview Import'}
                    {step === 'importing' && 'Importing Students...'}
                    {step === 'complete' && 'Import Complete'}
                  </Dialog.Title>
                  <button
                    type="button"
                    className="text-gray-400 hover:text-gray-500"
                    onClick={handleClose}
                  >
                    <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                  </button>
                </div>

                {error && (
                  <div className="mt-2 p-2 bg-red-50 text-red-700 rounded-md text-sm">
                    {error}
                  </div>
                )}

                {step === 'upload' && (
                  <div className="mt-4">
                    <p className="text-sm text-gray-500 mb-4">
                      Upload an Excel file (.xlsx) containing student information. The file should have first names in column A and last names in column B.
                    </p>
                    
                    <div 
                      ref={dropZoneRef}
                      className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md transition-colors duration-200"
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                    >
                      <div className="space-y-1 text-center">
                        <svg
                          className="mx-auto h-12 w-12 text-gray-400"
                          stroke="currentColor"
                          fill="none"
                          viewBox="0 0 48 48"
                          aria-hidden="true"
                        >
                          <path
                            d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <div className="flex text-sm text-gray-600">
                          <label
                            htmlFor="file-upload"
                            className="relative cursor-pointer bg-white rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500"
                          >
                            <span>Upload a file</span>
                            <input
                              id="file-upload"
                              name="file-upload"
                              type="file"
                              className="sr-only"
                              accept=".xlsx,.xls"
                              ref={fileInputRef}
                              onChange={handleFileUpload}
                            />
                          </label>
                          <p className="pl-1">or drag and drop</p>
                        </div>
                        <p className="text-xs text-gray-500">Excel (.xlsx, .xls) up to 10MB</p>
                      </div>
                    </div>
                  </div>
                )}

                {step === 'preview' && (
                  <div className="mt-4">
                    <p className="text-sm text-gray-500 mb-4">
                      Review the students that will be imported. {excelData.length} students found.
                      Click the trash icon to remove any students you don&apos;t want to import.
                    </p>
                    
                    <div className="mt-4 max-h-60 overflow-y-auto border rounded-md">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th scope="col" className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Action
                            </th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Student Name
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {excelData.map((student, index) => {
                            const firstName = extractFirstName(student[FIRST_NAME_COLUMN]?.toString() || '');
                            const lastName = student[LAST_NAME_COLUMN]?.toString()?.trim() || '';
                            const fullName = firstName && lastName ? `${firstName} ${lastName}` : '';
                            
                            return (
                              <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                <td className="px-2 py-2 whitespace-nowrap">
                                  <button
                                    onClick={() => handleRemoveStudent(index)}
                                    className="text-red-500 hover:text-red-700 transition-colors"
                                    title="Remove student"
                                  >
                                    <TrashIcon className="h-5 w-5" />
                                  </button>
                                </td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                                  {fullName || <span className="text-red-500">Missing name</span>}
                                </td>
                              </tr>
                            );
                          })}
                          {excelData.length === 0 && (
                            <tr>
                              <td colSpan={2} className="px-6 py-4 text-center text-sm text-gray-500">
                                No students to import. Please go back and upload a file.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    
                    <div className="flex justify-between mt-6">
                      <button
                        type="button"
                        className="inline-flex justify-center px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-transparent rounded-md hover:bg-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-500"
                        onClick={() => setStep('upload')}
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        className="inline-flex justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500"
                        onClick={handleImport}
                        disabled={excelData.length === 0}
                      >
                        Import Students
                      </button>
                    </div>
                  </div>
                )}

                {step === 'importing' && (
                  <div className="mt-4">
                    <p className="text-sm text-gray-500 mb-4">
                      Importing students... Please don&apos;t close this dialog.
                    </p>
                    
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div 
                        className="bg-indigo-600 h-2.5 rounded-full" 
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 text-right">{progress}%</p>
                  </div>
                )}

                {step === 'complete' && (
                  <div className="mt-4">
                    <div className="rounded-md bg-green-50 p-4">
                      <div className="flex">
                        <div className="flex-shrink-0">
                          <svg className="h-5 w-5 text-green-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div className="ml-3">
                          <h3 className="text-sm font-medium text-green-800">Import successful</h3>
                          <div className="mt-2 text-sm text-green-700">
                            <p>
                              Successfully imported {importResults.success} students.
                              {importResults.failed > 0 && ` ${importResults.failed} students were skipped due to missing names.`}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-6">
                      <button
                        type="button"
                        className="w-full inline-flex justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500"
                        onClick={handleClose}
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default ExcelImportDialog; 