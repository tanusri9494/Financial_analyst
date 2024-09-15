import React, { useState } from 'react';
import { FileText, Send, Upload } from 'lucide-react';

const PDFReader = () => {
  const [pdfs, setPdfs] = useState([]);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [images, setImages] = useState([]);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false); // New state for loading

  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files);
    setPdfs([...pdfs, ...files]);
    
    const formData = new FormData();
    files.forEach((file, index) => {
      formData.append(`pdf${index}`, file);
    });

    try {
      const response = await fetch('http://localhost:1800/uploadPDFs', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('PDFs uploaded successfully:', result);
    } catch (error) {
      console.error('Error uploading PDFs:', error);
      setError('Failed to upload PDFs. Please try again.');
    }
  };

  const handleSendMessage = async () => {
    if (inputMessage.trim() !== '') {
      const newMessage = { text: inputMessage, sender: 'user' };
      setMessages([...messages, newMessage]);
      setInputMessage('');
      setError(null);
      setIsLoading(true); // Set loading state to true when sending message

      try {
        const response = await fetch('http://localhost:1800/Reply', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: inputMessage }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        const aiMessage = { 
          text: data.text[0], 
          sender: 'ai',
          image: data.image_file.length > 0 ? `http://localhost:1800/image/${data.image_file[0]}` : null,
          pdfImage: data.pdf_path ? `http://localhost:1800/ALL_DATA/${data.pdf_path}` : null
        };
        
        setMessages(prev => [...prev, aiMessage]);

        // Add new images to the images array
        if (aiMessage.image) {
          setImages(prev => [...prev, { src: aiMessage.image, type: 'generated' }]);
        }
        if (aiMessage.pdfImage) {
          setImages(prev => [...prev, { src: aiMessage.pdfImage, type: 'pdf' }]);
        }
      } catch (error) {
        console.error('Error sending message:', error);
        setError('Failed to send message. Please try again.');
      } finally {
        setIsLoading(false); // Set loading state to false after response
      }
    }
  };

  return (
    <div className="flex flex-col h-screen bg-white text-black">
      <h1 className="text-2xl font-bold p-4 text-center bg-black text-white">
        {isLoading ? 'Analyzing... thinking...' : 'Financial Analyst'}
      </h1>
      <div className="flex flex-1 overflow-hidden">
        {/* PDF Viewer */}
        <div className="w-1/4 p-4 border-r border-gray-200 overflow-y-auto">
          <div className="mb-4">
            <label htmlFor="pdf-upload" className="flex items-center justify-center w-full p-2 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400">
              <Upload size={24} className="mr-2" />
              <span>Upload PDFs</span>
            </label>
            <input
              id="pdf-upload"
              type="file"
              accept=".pdf"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
          {pdfs.length > 0 ? (
            pdfs.map((pdf, index) => (
              <div key={index} className="p-2 mb-2 bg-gray-100 rounded-lg">
                <FileText size={16} className="inline mr-2" />
                {pdf.name}
              </div>
            ))
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              <FileText size={48} className="mr-2" />
              <p className="text-lg">No PDFs uploaded yet</p>
            </div>
          )}
        </div>

        {/* Chat Area */}
        <div className="w-1/2 flex flex-col">
          {/* Chat Messages */}
          <div className="flex-1 p-4 overflow-y-auto">
            {messages.map((message, index) => (
              <div key={index} className={`mb-4 ${message.sender === 'user' ? 'text-right' : 'text-left'}`}>
                <div className={`inline-block p-2 rounded-lg ${
                  message.sender === 'user' ? 'bg-black text-white' : 'bg-gray-100 text-black'
                }`}>
                  {message.text}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="text-center p-4 text-gray-500">
                AI is analyzing your input...
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-gray-200">
            <div className="flex items-center">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                className="flex-1 p-2 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="Ask a question about the financial report..."
              />
              <button
                onClick={handleSendMessage}
                className="p-2 bg-black text-white rounded-r-lg hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-black"
              >
                <Send size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* Image Viewer */}
        <div className="w-1/4 p-4 border-l border-gray-200 overflow-y-auto">
          <h2 className="text-xl font-bold mb-4">Generated Images</h2>
          {images.length > 0 ? (
            images.map((image, index) => (
              <div key={index} className="mb-4">
                <img src={image.src} alt={`Generated chart ${index + 1}`} className="w-full h-auto" />
                <p className="text-sm text-gray-500 mt-1">{image.type === 'generated' ? 'AI Generated' : 'From PDF'}</p>
              </div>
            ))
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              <p className="text-lg">No images generated yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">Error:</strong>
          <span className="block sm:inline"> {error}</span>
        </div>
      )}
    </div>
  );
};

export default PDFReader;
