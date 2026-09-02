const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a buffer to Cloudinary via stream.
 * @param {Buffer} buffer - The file buffer to upload
 * @param {string} folder - Cloudinary folder (e.g. 'entities', 'npcs', 'skins')
 * @param {string} [publicId] - Optional custom public_id (without extension)
 * @param {string} [mimetype] - MIME type to determine format (e.g. 'image/png')
 * @returns {Promise<string>} The secure URL of the uploaded image
 */
function uploadBuffer(buffer, folder, publicId, mimetype) {
    return new Promise((resolve, reject) => {
        const format = mimetype ? mimetype.split('/').pop().replace('jpeg', 'jpg') : 'png';
        const opts = {
            folder: `entitybattle/${folder}`,
            resource_type: 'image',
            format,
            overwrite: true,
        };
        if (publicId) opts.public_id = publicId;

        const stream = cloudinary.uploader.upload_stream(opts, (error, result) => {
            if (error) return reject(error);
            resolve(result.secure_url);
        });

        const readable = new Readable();
        readable.push(buffer);
        readable.push(null);
        readable.pipe(stream);
    });
}

/**
 * Upload a base64 string (with or without data: prefix) to Cloudinary.
 * @param {string} base64Data - Base64 string, optionally with data:image/...;base64, prefix
 * @param {string} folder - Cloudinary folder
 * @param {string} [publicId] - Optional custom public_id
 * @returns {Promise<string>} The secure URL
 */
async function uploadBase64(base64Data, folder, publicId) {
    let data = String(base64Data || '');
    let mimetype = 'image/png';

    if (data.startsWith('data:')) {
        const match = data.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
            mimetype = match[1];
            data = match[2];
        }
    }

    const buffer = Buffer.from(data, 'base64');
    return uploadBuffer(buffer, folder, publicId, mimetype);
}

module.exports = { cloudinary, uploadBuffer, uploadBase64 };
