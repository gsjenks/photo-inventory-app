import React from 'react';
import type { Document } from '../types';
import { FileText, Plus, Download } from 'lucide-react';

interface DocumentsListProps {
  documents: Document[];
  companyId?: string;
  saleId?: string;
  onRefresh: () => void;
}

export default function DocumentsList({ documents }: DocumentsListProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Documents</h2>
        <button
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 shadow-sm transition-all"
          onClick={() => alert('Document upload coming soon!')}
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
            onClick={() => alert('Document upload coming soon!')}
          >
            Upload your first document
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{doc.name}</h3>
                  <p className="text-sm text-gray-600">{doc.file_type || 'Document'}</p>
                </div>
              </div>
              <button
                className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                onClick={() => alert('Download functionality coming soon!')}
                aria-label={`Download ${doc.name}`}
              >
                <Download className="w-5 h-5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}