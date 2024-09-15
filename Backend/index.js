const express = require('express');
const fs = require('fs');
const {  getTopTABLE,
  getTopTEXT,
  getTopIMAGE, } = require('./embedding'); // Import your functions
const path = require("path");
const app = express();
const port = 1800;
const { formatReply, uploadPDFs }= require('./api');
const cors = require('cors');
const OpenAI =require("openai");
app.use(cors());
app.use(express.json());
const { v4: uuidv4 } = require('uuid');
const { pdfToPng } = require('pdf-to-png-converter'); 
const multer = require('multer');
const upload = multer({ dest: 'ALL_DATA/' }); 

app.use('/image', express.static(path.join(__dirname, 'image')));

app.use('/ALL_DATA', express.static(path.join(__dirname, 'ALL_DATA')));
const openai = new OpenAI({apiKey:""});


// Route to fetch top table results
app.post('/getTopTable', async (req, res) => {
  const query = req.body.query;
  try {
    const result = await getTopTABLE(query);
    res.status(200).json({ result });
  } catch (error) {
    console.error("Error fetching table:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Route to fetch top text results
app.post('/getTopText', async (req, res) => {
  const query = req.body.query;
  try {
    const result = await getTopTEXT(query);
    res.status(200).json({ result });
  } catch (error) {
    console.error("Error fetching text:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Route to fetch top image results
app.post('/getTopImage', async (req, res) => {
  const query = req.body.query;
  try {
    const result = await getTopIMAGE(query);
    console.log("|||||||||||||||||||||||||||||||||||||||||0")
    imageName=result[0]
    console.log("Expected chunk to be a string but got:", typeof result[0])

    const Name = await extractImageName(result[0]); // Parse JSON from string

    
    res.status(200).json({ image: Name });

  } catch (error) {
    console.error("Error fetching images:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.post('/Reply', async (req, res) => {
  const { message } = req.body; // Change query to message to match frontend
  try {
    const result = await formatReply(message);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in formatReply:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});



async function extractImageName(chunk) {
  // Remove any unwanted characters (newlines, excessive spaces) to clean the string.
  const cleanedChunk = chunk.replace(/[\n\r]+/g, '').replace(/\s{2,}/g, ' ');

  try {
    // Convert the cleaned chunk into a JSON object
    const jsonString = cleanedChunk.match(/\{.*\}/)[0]; // Extract the JSON part
    const parsedData = JSON.parse(jsonString);  // Parse JSON from string
    
    // Access the image name
    const imageName = parsedData.image_name;
    
    console.log("Extracted Image Name:", imageName);
    return imageName;
  } catch (error) {
    console.error("Error parsing JSON:", error);
    return null;
  }
}



app.post('/upload', upload.single('pdf0'), async (req, res) => {
  const pdfPath = req.file.path;  // Uploaded PDF path
  console.log("HERE IS THE REQ", req.file);  // Log the uploaded file

  function getRandomNumber(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  
  // Example usage:
  const randomNumber = getRandomNumber(1, 100);  

  uniqueFileName = `pdffrontpage${randomNumber}.png`;
  const outputPath = path.join(__dirname, "ALL_DATA", uniqueFileName); // Store in ALL_DATA folder
  console.log("FILE NAME", uniqueFileName);
  // Convert the first page of the PDF to PNG and save it in ALL_DATA
  const outputImages = await pdfToPng(pdfPath, {
    pages: [1], // Only convert the first page
    outputFileMask: outputPath
  });

  const firstPageImageLocation = outputImages[0].path;
  console.log('Image saved at:', firstPageImageLocation);


  try {
    const vectorStoreId = "vs_zhFoJH6MRpIYrGbWapJN6zPy";
    const fileStream = fs.createReadStream(pdfPath);
    const status = await openai.beta.vectorStores.fileBatches.uploadAndPoll(vectorStoreId, [fileStream]);
    console.log("Uploaded to vector store:", status.data);
  } catch (error) {
    console.error("Error uploading to vector store:", error);
  }

  // Send the image location and vector store confirmation back to the frontend
  res.json({ imageUrl: `/ALL_DATA/${uniqueFileName}`, fileName: req.file.filename, vectorStore: 'Upload successful' });
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
