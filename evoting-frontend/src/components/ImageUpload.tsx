import {useEffect, useRef, useState, type ChangeEvent} from 'react';
import {FiImage, FiPlus, FiTrash2} from 'react-icons/fi';
import api from '../apiConfig';
import IconButton from './ui/IconButton';

interface ImageUploadProps { onUploadSuccess: (url: string) => void; currentImageUrl?: string; className?: string; }
type ApiError = {response?: {data?: {detail?: string}}};

export default function ImageUpload({onUploadSuccess, currentImageUrl, className = ''}: ImageUploadProps) {
    const [uploading, setUploading] = useState(false);
    const [preview, setPreview] = useState<string | null>(currentImageUrl || null);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        setPreview(currentImageUrl || null);
        setError(null);
    }, [currentImageUrl]);
    const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]; if (!file) return;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Invalid file type. Please use JPEG, PNG or WebP.'); return; }
        if (file.size > 5 * 1024 * 1024) { setError('File too large. Maximum size is 5MB.'); return; }
        setError(null); setUploading(true);
        const reader = new FileReader(); reader.onloadend = () => setPreview(reader.result as string); reader.readAsDataURL(file);
        try {
            const formData = new FormData(); formData.append('image', file);
            const response = await api.post('/api/upload/image/', formData, {headers: {'Content-Type': 'multipart/form-data'}});
            const {url} = response.data as {url: string}; onUploadSuccess(url); setPreview(url);
        } catch (caughtError: unknown) {
            const detail = (caughtError as ApiError).response?.data?.detail;
            console.error('Upload error:', caughtError); setError(detail || 'Failed to upload image. Please try again.'); setPreview(currentImageUrl || null);
        } finally { setUploading(false); }
    };
    const handleRemove = () => { setPreview(null); onUploadSuccess(''); if (fileInputRef.current) fileInputRef.current.value = ''; };
    return <div className={className}>
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileSelect} className="hidden" aria-label="Choose candidate photo"/>
        {preview ? <div className="relative group">
            <img src={preview} alt="Candidate photo preview" className="w-24 h-24 object-cover rounded-lg border border-gray-200"/>
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                <IconButton label="Change photo" icon={<FiImage aria-hidden="true"/>} size="compact" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="bg-white"/>
                <IconButton label="Remove photo" icon={<FiTrash2 aria-hidden="true"/>} size="compact" onClick={handleRemove} disabled={uploading} className="bg-white text-red-600"/>
            </div>
            {uploading && <div className="absolute inset-0 bg-white/80 rounded-lg flex items-center justify-center" role="status"><span className="ui-spinner" aria-label="Uploading photo"/></div>}
        </div> : <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50/50 transition flex flex-col items-center justify-center gap-1 disabled:opacity-50">
            {uploading ? <span className="ui-spinner" aria-label="Uploading photo"/> : <><FiPlus className="w-6 h-6 text-gray-400" aria-hidden="true"/><span className="text-xs text-gray-500">Add Photo</span></>}
        </button>}
        {error && <p className="ui-field-error mt-1" role="alert">{error}</p>}
    </div>;
}
