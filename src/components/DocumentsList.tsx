import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Document } from '../types';
import { FileText, Plus, Download, X, Upload, Edit, Trash2, ExternalLink, Maximize2, Loader, AlertCircle } from 'lucide-react';

interface DocumentsListProps {
  documents: Document[];
  companyId?: string;
  saleId?: string;
  onRefresh: () => void;
}

export default function DocumentsList({ documents, companyId, saleId, onRefresh }: DocumentsListProps) {
  const [showModal, setShowModal] = useState(false);
  const [showViewerModal, setShowViewerModal] = useState(false);
  const [viewingDocument, setViewingDocument] = useState<Document | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string>('');
  const [loadingViewer, setLoadingViewer] = useState(false);
  const [viewerError, setViewerError] = useState<string>('');
  const [editingDocument, setEditingDocument] = useState<Document | null>(null);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    document_type: 'other'
  });

  const openAddModal = () => {
    setEditingDocument(null);
    setFormData({
      name: '',
      description: '',
      document_type: 'other'
    });
    setFile(null);
    setShowModal(true);
  };

  const openEditModal = (e: React.MouseEvent, doc: Document) => {
    e.stopPropagation();
    setEditingDocument(doc);
    setFormData({
      name: doc.name || '',
      description: doc.description || '',
      document_type: doc.document_type || 'other'
    });
    setFile(null);
    setShowModal(true);
  };

  const openViewModal = async (doc: Document) => {
    setViewingDocument(doc);
    setShowViewerModal(true);
    setLoadingViewer(true);
    setViewerError('');
    setViewerUrl('');

    try {
      // First try to get a signed URL if we have a file_path
      if (doc.file_path) {
        const { data, error } = await supabase.storage
          .from('documents')
          .createSignedUrl(doc.file_path, 3600); // Valid for 1 hour

        if (error) {
          console.error('Error creating signed URL:', error);
          // Fall back to public URL if available
          if (doc.file_url) {
            setViewerUrl(doc.file_url);
          } else {
            throw new Error('Unable to access document. The storage bucket may be private or the file may not exist.');
          }
        } else if (data?.signedUrl) {
          setViewerUrl(data.signedUrl);
        }
      } else if (doc.file_url) {
        // Use public URL directly
        setViewerUrl(doc.file_url);
      } else {
        throw new Error('No file path or URL available for this document');
      }
    } catch (error: any) {
      console.error('Error loading document:', error);
      setViewerError(error.message || 'Failed to load document');
    } finally {
      setLoadingViewer(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      
      if (!formData.name) {
        setFormData(prev => ({
          ...prev,
          name: selectedFile.name
        }));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!editingDocument && !file) {
      alert('Please select a file to upload');
      return;
    }

    setUploading(true);

    try {
      if (editingDocument) {
        const { error: dbError } = await supabase
          .from('documents')
          .update({
            name: formData.name,
            description: formData.description || null,
            document_type: formData.document_type
          })
          .eq('id', editingDocument.id);

        if (dbError) throw dbError;
      } else {
        if (!file) return;

        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
        const filePath = `${companyId || 'general'}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('documents')
          .getPublicUrl(filePath);

        const { error: dbError } = await supabase
          .from('documents')
          .insert([{
            name: formData.name,
            file_name: file.name,
            description: formData.description || null,
            file_type: file.type || 'application/octet-stream',
            file_path: filePath,
            file_url: urlData.publicUrl,
            file_size: file.size,
            document_type: formData.document_type,
            company_id: companyId,
            sale_id: saleId || null
          }]);

        if (dbError) throw dbError;
      }

      setFormData({
        name: '',
        description: '',
        document_type: 'other'
      });
      setFile(null);
      setShowModal(false);
      setEditingDocument(null);
      onRefresh();
    } catch (error: any) {
      console.error('Error saving document:', error);
      
      if (error.message?.includes('storage')) {
        alert('Storage bucket not found. Please set up the "documents" storage bucket in Supabase first.');
      } else {
        alert('Failed to save document: ' + (error.message || 'Unknown error'));
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, doc: Document) => {
    e.stopPropagation();
    
    if (!confirm(`Are you sure you want to delete "${doc.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      if (doc.file_path) {
        const { error: storageError } = await supabase.storage
          .from('documents')
          .remove([doc.file_path]);

        if (storageError) {
          console.warn('Error deleting file from storage:', storageError);
        }
      }

      const { error: dbError } = await supabase
        .from('documents')
        .delete()
        .eq('id', doc.id);

      if (dbError) throw dbError;
      
      onRefresh();
    } catch (error) {
      console.error('Error deleting document:', error);
      alert('Failed to delete document');
    }
  };

  const handleDownload = async (e: React.MouseEvent, doc: Document) => {
    e.stopPropagation();
    
    try {
      if (doc.file_path) {
        const { data, error } = await supabase.storage
          .from('documents')
          .createSignedUrl(doc.file_path, 60);

        if (error) throw error;
        if (data?.signedUrl) {
          window.open(data.signedUrl, '_blank');
          return;
        }
      }
      
      if (doc.file_url) {
        window.open(doc.file_url, '_blank');
      }
    } catch (error) {
      console.error('Error downloading document:', error);
      alert('Failed to download document');
    }
  };

  const openInNewTab = () => {
    if (viewerUrl) {
      window.open(viewerUrl, '_blank');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.includes('pdf')) return '📄';
    if (fileType.includes('image')) return '🖼️';
    if (fileType.includes('word') || fileType.includes('document')) return '📝';
    if (fileType.includes('excel') || fileType.includes('spreadsheet')) return '📊';
    if (fileType.includes('zip') || fileType.includes('compressed')) return '📦';
    return '📄';
  };

  const canPreview = (fileType: string) => {
    return fileType.includes('pdf') || 
           fileType.includes('image');
  };

  const renderDocumentPreview = () => {
    if (!viewingDocument) return null;

    if (loadingViewer) {
      return (
        <div className="flex items-center justify-center h-full bg-gray-100">
          <div className="text-center">
            <Loader className="w-12 h-12 text-indigo-600 mx-auto mb-4 animate-spin" />
            <p className="text-gray-600">Loading document...</p>
          </div>
        </div>
      );
    }

    if (viewerError) {
      return (
        <div className="flex items-center justify-center h-full bg-gray-100">
          <div className="text-center max-w-md px-4">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Unable to Load Document</h3>
            <p className="text-gray-600 mb-4">{viewerError}</p>
            {viewingDocument.file_path && (
              <button
                onClick={openInNewTab}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 inline-flex items-center gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                Try Opening in New Tab
              </button>
            )}
          </div>
        </div>
      );
    }

    if (!viewerUrl) {
      return (
        <div className="flex items-center justify-center h-full bg-gray-100">
          <div className="text-center">
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No preview available</p>
          </div>
        </div>
      );
    }

    // PDF Preview
    if (viewingDocument.file_type?.includes('pdf')) {
      return (
        <iframe
          src={viewerUrl}
          className="w-full h-full border-0"
          title={viewingDocument.name}
        />
      );
    }

    // Image Preview
    if (viewingDocument.file_type?.includes('image')) {
      return (
        <div className="flex items-center justify-center h-full bg-gray-900 p-4">
          <img
            src={viewerUrl}
            alt={viewingDocument.name}
            className="max-w-full max-h-full object-contain"
          />
        </div>
      );
    }

    // Default: Show download option
    return (
      <div className="flex items-center justify-center h-full bg-gray-100">
        <div className="text-center">
          <div className="text-6xl mb-4">{getFileIcon(viewingDocument.file_type || '')}</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{viewingDocument.name}</h3>
          <p className="text-gray-600 mb-4">
            This file type cannot be previewed in the browser
          </p>
          <button
            onClick={openInNewTab}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 inline-flex items-center gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            Open in New Tab
          </button>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Documents</h2>
        <button
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 shadow-sm transition-all"
          onClick={openAddModal}
        >
          <Plus className="w-4 h-4" />
          Upload Document
        </button>
      </div>

      {documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-500">
          <FileText className="w-12 h-12 text-gray-400 mb-4" />
          <p className="text-sm text-gray-600 mb-4">No documents yet</p>
          <button
            className="text-indigo-600 hover:text-indigo-700 font-medium text-sm transition-colors"
            onClick={openAddModal}
          >
            Upload your first document
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <div
              key={doc.id}
              onClick={() => openViewModal(doc)}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer flex items-center justify-between group"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="text-3xl">
                  {getFileIcon(doc.file_type || '')}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate group-hover:text-indigo-600 transition-colors">
                    {doc.name}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <span className="capitalize">{doc.document_type || 'Document'}</span>
                    {doc.file_size && (
                      <>
                        <span>•</span>
                        <span>{formatFileSize(doc.file_size)}</span>
                      </>
                    )}
                    {canPreview(doc.file_type || '') && (
                      <>
                        <span>•</span>
                        <span className="text-indigo-600 flex items-center gap-1">
                          <Maximize2 className="w-3 h-3" />
                          Click to preview
                        </span>
                      </>
                    )}
                  </div>
                  {doc.description && (
                    <p className="text-sm text-gray-500 mt-1 truncate">{doc.description}</p>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                <button
                  className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                  onClick={(e) => handleDownload(e, doc)}
                  aria-label={`Download ${doc.name}`}
                  title="Download"
                >
                  <Download className="w-5 h-5" />
                </button>
                <button
                  onClick={(e) => openEditModal(e, doc)}
                  className="p-2 rounded-lg hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 transition-all"
                  aria-label="Edit document"
                  title="Edit details"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => handleDelete(e, doc)}
                  className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-all"
                  aria-label="Delete document"
                  title="Delete document"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Document Viewer Modal */}
      {showViewerModal && viewingDocument && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full h-full max-w-6xl max-h-[90vh] flex flex-col">
            <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between bg-white rounded-t-lg flex-shrink-0">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="text-2xl">{getFileIcon(viewingDocument.file_type || '')}</div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 truncate">
                    {viewingDocument.name}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <span className="capitalize">{viewingDocument.document_type}</span>
                    {viewingDocument.file_size && (
                      <>
                        <span>•</span>
                        <span>{formatFileSize(viewingDocument.file_size)}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                <button
                  onClick={openInNewTab}
                  disabled={!viewerUrl}
                  className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Open in new tab"
                >
                  <ExternalLink className="w-5 h-5" />
                </button>
                <button
                  onClick={(e) => handleDownload(e, viewingDocument)}
                  className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                  title="Download"
                >
                  <Download className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setShowViewerModal(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              {renderDocumentPreview()}
            </div>

            {viewingDocument.description && !loadingViewer && !viewerError && (
              <div className="border-t border-gray-200 px-6 py-3 bg-gray-50 rounded-b-lg flex-shrink-0">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Description:</span> {viewingDocument.description}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add/Edit Document Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full">
            <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingDocument ? 'Edit Document' : 'Upload Document'}
              </h3>
              <button
                onClick={() => {
                  setShowModal(false);
                  setFile(null);
                  setEditingDocument(null);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {!editingDocument && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select File *
                  </label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-indigo-400 transition-colors">
                    <input
                      type="file"
                      onChange={handleFileChange}
                      required
                      className="hidden"
                      id="file-upload"
                    />
                    <label
                      htmlFor="file-upload"
                      className="cursor-pointer flex flex-col items-center"
                    >
                      <Upload className="w-10 h-10 text-gray-400 mb-2" />
                      {file ? (
                        <div className="text-sm">
                          <p className="font-medium text-gray-900">{file.name}</p>
                          <p className="text-gray-500">{formatFileSize(file.size)}</p>
                        </div>
                      ) : (
                        <div className="text-sm">
                          <p className="text-indigo-600 font-medium">Click to upload</p>
                          <p className="text-gray-500">or drag and drop</p>
                        </div>
                      )}
                    </label>
                  </div>
                </div>
              )}

              {editingDocument && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Current File:</p>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{getFileIcon(editingDocument.file_type || '')}</span>
                    <div>
                      <p className="font-medium text-gray-900">{editingDocument.file_name}</p>
                      {editingDocument.file_size && (
                        <p className="text-sm text-gray-500">{formatFileSize(editingDocument.file_size)}</p>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Note: To replace the file, delete this document and upload a new one.</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Document Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g., Sales Agreement, Invoice, Photo"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Document Type
                </label>
                <select
                  value={formData.document_type}
                  onChange={(e) => setFormData(prev => ({ ...prev, document_type: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="contract">Contract</option>
                  <option value="invoice">Invoice</option>
                  <option value="receipt">Receipt</option>
                  <option value="photo">Photo</option>
                  <option value="report">Report</option>
                  <option value="correspondence">Correspondence</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Optional description or notes about this document..."
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setFile(null);
                    setEditingDocument(null);
                  }}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading || (!editingDocument && !file)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {uploading ? (editingDocument ? 'Saving...' : 'Uploading...') : (editingDocument ? 'Update' : 'Upload')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}