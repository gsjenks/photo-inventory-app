import React from 'react';
import type { Contact } from '../types';
import { Users, Plus, Mail, Phone } from 'lucide-react';

interface ContactsListProps {
  contacts: Contact[];
  companyId?: string;
  saleId?: string;
  onRefresh: () => void;
}

export default function ContactsList({ contacts }: ContactsListProps) {
  // Helper function to format contact name
  const getContactName = (contact: Contact) => {
    const nameParts = [
      contact.prefix,
      contact.first_name,
      contact.middle_name,
      contact.last_name,
      contact.suffix
    ].filter(Boolean);
    
    const fullName = nameParts.join(' ');
    return contact.business_name ? `${fullName} (${contact.business_name})` : fullName;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Contacts</h2>
        <button
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 shadow-sm transition-all"
          onClick={() => alert('Contact modal coming soon!')}
        >
          <Plus className="w-4 h-4" />
          New Contact
        </button>
      </div>

      {contacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-500">
          <Users className="w-12 h-12 text-gray-400 mb-4" />
          <p className="text-sm text-gray-600 mb-4">No contacts yet</p>
          <button
            className="text-indigo-600 hover:text-indigo-700 font-medium text-sm transition-colors"
            onClick={() => alert('Contact modal coming soon!')}
          >
            Add your first contact
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {getContactName(contact)}
                  </h3>
                  {contact.role && (
                    <p className="text-sm text-gray-600 mt-1">{contact.role}</p>
                  )}
                  <div className="mt-2 space-y-1">
                    {contact.email && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Mail className="w-4 h-4" />
                        {contact.email}
                      </div>
                    )}
                    {contact.phone && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Phone className="w-4 h-4" />
                        {contact.phone}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}