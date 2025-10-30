import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Contact } from '../types';
import { Users, Plus, Mail, Phone, X, Edit, Trash2, MapPin, Building2, Briefcase } from 'lucide-react';

interface ContactsListProps {
  contacts: Contact[];
  companyId?: string;
  saleId?: string;
  onRefresh: () => void;
}

export default function ContactsList({ contacts, companyId, saleId, onRefresh }: ContactsListProps) {
  const [showModal, setShowModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    prefix: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    suffix: '',
    business_name: '',
    role: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip_code: '',
    notes: ''
  });

  const openAddModal = () => {
    setEditingContact(null);
    setFormData({
      prefix: '',
      first_name: '',
      middle_name: '',
      last_name: '',
      suffix: '',
      business_name: '',
      role: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      state: '',
      zip_code: '',
      notes: ''
    });
    setShowModal(true);
  };

  const openEditModal = (contact: Contact) => {
    setEditingContact(contact);
    setFormData({
      prefix: contact.prefix || '',
      first_name: contact.first_name || '',
      middle_name: contact.middle_name || '',
      last_name: contact.last_name || '',
      suffix: contact.suffix || '',
      business_name: contact.business_name || '',
      role: contact.role || '',
      email: contact.email || '',
      phone: contact.phone || '',
      address: contact.address || '',
      city: contact.city || '',
      state: contact.state || '',
      zip_code: contact.zip_code || '',
      notes: contact.notes || ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (editingContact) {
        // UPDATE existing contact
        const { error } = await supabase
          .from('contacts')
          .update(formData)
          .eq('id', editingContact.id);

        if (error) throw error;
      } else {
        // CREATE new contact
        const contactData = {
          ...formData,
          company_id: companyId,
          sale_id: saleId || null
        };

        const { error } = await supabase
          .from('contacts')
          .insert([contactData]);

        if (error) throw error;
      }

      // Reset form and close modal
      setFormData({
        prefix: '',
        first_name: '',
        middle_name: '',
        last_name: '',
        suffix: '',
        business_name: '',
        role: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        state: '',
        zip_code: '',
        notes: ''
      });
      setShowModal(false);
      setEditingContact(null);
      onRefresh();
    } catch (error) {
      console.error('Error saving contact:', error);
      alert('Failed to save contact');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (contact: Contact) => {
    const contactName = getContactName(contact);
    if (!confirm(`Are you sure you want to delete "${contactName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', contact.id);

      if (error) throw error;
      onRefresh();
    } catch (error) {
      console.error('Error deleting contact:', error);
      alert('Failed to delete contact');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  // Helper function to format contact name
  const getContactName = (contact: Contact) => {
    const nameParts = [
      contact.prefix,
      contact.first_name,
      contact.middle_name,
      contact.last_name,
      contact.suffix
    ].filter(Boolean);
    
    return nameParts.join(' ');
  };

  // Helper function to format address
  const getFullAddress = (contact: Contact) => {
    const parts = [];
    if (contact.address) parts.push(contact.address);
    
    const cityStateZip = [contact.city, contact.state, contact.zip_code]
      .filter(Boolean)
      .join(', ');
    
    if (cityStateZip) parts.push(cityStateZip);
    
    return parts.join(', ');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Contacts</h2>
        <button
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 shadow-sm transition-all"
          onClick={openAddModal}
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
            onClick={openAddModal}
          >
            Add your first contact
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-md transition-shadow group"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-3">
                  {/* Name and Business */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {getContactName(contact)}
                    </h3>
                    {contact.business_name && (
                      <div className="flex items-center gap-2 text-gray-600 mt-1">
                        <Building2 className="w-4 h-4 flex-shrink-0" />
                        <span className="text-sm">{contact.business_name}</span>
                      </div>
                    )}
                    {contact.role && (
                      <div className="flex items-center gap-2 text-gray-600 mt-1">
                        <Briefcase className="w-4 h-4 flex-shrink-0" />
                        <span className="text-sm">{contact.role}</span>
                      </div>
                    )}
                  </div>

                  {/* Contact Information */}
                  <div className="space-y-2">
                    {contact.email && (
                      <div className="flex items-center gap-2 text-gray-700">
                        <Mail className="w-4 h-4 flex-shrink-0 text-gray-400" />
                        <a 
                          href={`mailto:${contact.email}`}
                          className="text-sm hover:text-indigo-600 transition-colors"
                        >
                          {contact.email}
                        </a>
                      </div>
                    )}
                    {contact.phone && (
                      <div className="flex items-center gap-2 text-gray-700">
                        <Phone className="w-4 h-4 flex-shrink-0 text-gray-400" />
                        <a 
                          href={`tel:${contact.phone}`}
                          className="text-sm hover:text-indigo-600 transition-colors"
                        >
                          {contact.phone}
                        </a>
                      </div>
                    )}
                    {getFullAddress(contact) && (
                      <div className="flex items-start gap-2 text-gray-700">
                        <MapPin className="w-4 h-4 flex-shrink-0 text-gray-400 mt-0.5" />
                        <span className="text-sm">{getFullAddress(contact)}</span>
                      </div>
                    )}
                  </div>

                  {/* Notes */}
                  {contact.notes && (
                    <div className="pt-2 border-t border-gray-100">
                      <p className="text-sm text-gray-600 italic">
                        "{contact.notes}"
                      </p>
                    </div>
                  )}
                </div>
                
                {/* Action buttons */}
                <div className="flex items-center gap-1 ml-4 flex-shrink-0">
                  <button
                    onClick={() => openEditModal(contact)}
                    className="p-2 rounded-lg hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 transition-all"
                    aria-label="Edit contact"
                    title="Edit contact"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(contact)}
                    className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-all"
                    aria-label="Delete contact"
                    title="Delete contact"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Contact Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingContact ? 'Edit Contact' : 'Add New Contact'}
              </h3>
              <button
                onClick={() => {
                  setShowModal(false);
                  setEditingContact(null);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Name Section */}
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-3">Personal Information</h4>
                <div className="grid grid-cols-6 gap-3">
                  <div className="col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Prefix
                    </label>
                    <select
                      name="prefix"
                      value={formData.prefix}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">-</option>
                      <option value="Mr.">Mr.</option>
                      <option value="Mrs.">Mrs.</option>
                      <option value="Ms.">Ms.</option>
                      <option value="Dr.">Dr.</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      First Name *
                    </label>
                    <input
                      type="text"
                      name="first_name"
                      value={formData.first_name}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Middle
                    </label>
                    <input
                      type="text"
                      name="middle_name"
                      value={formData.middle_name}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      name="last_name"
                      value={formData.last_name}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Business Information */}
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-3">Business Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Business Name
                    </label>
                    <input
                      type="text"
                      name="business_name"
                      value={formData.business_name}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Role/Title
                    </label>
                    <input
                      type="text"
                      name="role"
                      value={formData.role}
                      onChange={handleChange}
                      placeholder="e.g., Estate Executor, Buyer"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Contact Information */}
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-3">Contact Details</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Address */}
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-3">Address</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Street Address
                    </label>
                    <input
                      type="text"
                      name="address"
                      value={formData.address}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="grid grid-cols-6 gap-3">
                    <div className="col-span-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        City
                      </label>
                      <input
                        type="text"
                        name="city"
                        value={formData.city}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        State
                      </label>
                      <input
                        type="text"
                        name="state"
                        value={formData.state}
                        onChange={handleChange}
                        maxLength={2}
                        placeholder="GA"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Zip Code
                      </label>
                      <input
                        type="text"
                        name="zip_code"
                        value={formData.zip_code}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Additional notes about this contact..."
                />
              </div>

              {/* Form Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingContact(null);
                  }}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? 'Saving...' : editingContact ? 'Update Contact' : 'Add Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}