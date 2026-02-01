import { useState, useRef } from 'react';
import api from '../apiConfig';

interface ImageUploadProps {
    onUploadSuccess: (url: string) => void;
    currentImageUrl?: string;
    className?: string;
}

export default function ImageUpload({ onUploadSuccess, currentImageUrl, className = '' }: ImageUploadProps) {
    const [uploading, setUploading] = useState(false);
    const [preview, setPreview] = useState<string | null>(currentImageUrl || null);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            setError('Invalid file type. Please use JPEG, PNG or WebP.');
            return;
        }

        // Validate file size (5MB max)
        if (file.size > 5 * 1024 * 1024) {
            setError('File too large. Maximum size is 5MB.');
            return;
        }

        setError(null);
        setUploading(true);

        // Show local preview immediately
        const reader = new FileReader();
        reader.onloadend = () => {
            setPreview(reader.result as string);
        };
        reader.readAsDataURL(file);

        // Upload to server
        try {
            const formData = new FormData();
            formData.append('image', file);

            const response = await api.post('/api/upload/image/', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });

            const { url } = response.data;
            onUploadSuccess(url);
            setPreview(url);
        } catch (err: any) {
            console.error('Upload error:', err);
            setError(err.response?.data?.detail || 'Failed to upload image. Please try again.');
            setPreview(currentImageUrl || null);
        } finally {
            setUploading(false);
        }
    };

    const handleClick = () => {
        fileInputRef.current?.click();
    };

    const handleRemove = () => {
        setPreview(null);
        onUploadSuccess('');
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div className={`${className}`}>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleFileSelect}
                className="hidden"
            />

            {preview ? (
                <div className="relative group">
                    <img
                        src={preview}
                        alt="Candidate photo"
                        className="w-24 h-24 object-cover rounded-lg border border-gray-200"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                        <button
                            type="button"
                            onClick={handleClick}
                            disabled={uploading}
                            className="p-1.5 bg-white rounded-full hover:bg-gray-100 transition"
                            title="Change photo"
                        >
                            <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                        </button>
                        <button
                            type="button"
                            onClick={handleRemove}
                            disabled={uploading}
                            className="p-1.5 bg-white rounded-full hover:bg-red-50 transition"
                            title="Remove photo"
                        >
                            <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                    {uploading && (
                        <div className="absolute inset-0 bg-white/80 rounded-lg flex items-center justify-center">
                            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    )}
                </div>
            ) : (
                <button
                    type="button"
                    onClick={handleClick}
                    disabled={uploading}
                    className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50/50 transition flex flex-col items-center justify-center gap-1 disabled:opacity-50"
                >
                    {uploading ? (
                        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                        <>
                            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                            <span className="text-xs text-gray-500">Add Photo</span>
                        </>
                    )}
                </button>
            )}

            {error && (
                <p className="text-xs text-red-600 mt-1">{error}</p>
            )}
        </div>
    );
}
