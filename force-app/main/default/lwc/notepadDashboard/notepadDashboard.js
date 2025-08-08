import { LightningElement, api, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { NavigationMixin } from 'lightning/navigation';
import USER_ID from '@salesforce/user/Id';

// Apex – Notes
import getMyNotes from '@salesforce/apex/NotepadDashboardController.getMyNotes';
import updateNoteText from '@salesforce/apex/NotepadDashboardController.updateNoteText';
import deleteNoteSrv from '@salesforce/apex/NotepadDashboardController.deleteNote';

// Apex – Multi-Object Lookup
import getBatchRecordIds from '@salesforce/apex/NotepadDashboardController.getBatchRecordIds';

// Apex – Reminders
import createNoteReminder from '@salesforce/apex/NoteReminderController.createNoteReminder';
import NoteReminderExists from '@salesforce/apex/NoteReminderController.NoteReminderExists';
import removeNoteReminder from '@salesforce/apex/NoteReminderController.removeNoteReminder';

import { refreshApex } from '@salesforce/apex';

// Static resource icons
import noteEditIcon from '@salesforce/resourceUrl/noteEditIcon';
import noteDeleteIcon from '@salesforce/resourceUrl/noteDeleteIcon';
import noteNotifyMeOnIcon from '@salesforce/resourceUrl/noteNotifyMeOnIcon';
import noteNotfiyMeOffIcon from '@salesforce/resourceUrl/noteNotfiyMeOffIcon';

export default class NotepadDashboard extends NavigationMixin(LightningElement) {
  @api includecompleted;
  @api maxrecords;

  currentUserId = USER_ID;

  @track notes = [];
  noteText = '';
  newNoteDue;
  isAdding = false;
  loading = false;

  showDeleteModal = false;
  notePendingDelete;
  wiredResult;

  editNoteIcon = noteEditIcon;
  deleteNoteIcon = noteDeleteIcon;

  // --------------------------------------------------------------------------
  // Wire: load my notes
  // --------------------------------------------------------------------------
  @wire(getMyNotes, { includeCompleted: '$includecompleted', maxRecords: '$maxrecords' })
  wiredNotes(result) {
    this.wiredResult = result;
    const { data, error } = result;
    if (data) {
      this.notes = data.map((n) => this._mapNote(n));
      this._hydrateRecordLinks();     // Updated method name
      this._hydrateReminders();       // Populate reminder states
      this.loading = false;
    } else if (error) {
      console.error('getMyNotes error', error);
      this._toast('Error', 'Failed to load notes.', 'error');
      this.loading = false;
    } else {
      this.loading = true;
    }
  }

  // --------------------------------------------------------------------------
  // Mapping helpers
  // --------------------------------------------------------------------------
  _mapNote(n) {
    const completed = n.Completed__c === true;
    const recordName = n.TargetObjectName__c;    // Generic record name
    const objectType = n.TargetObjectType__c;    // Object API name

    return {
      ...n,
      isEditing: false,
      isCompleted: completed,
      noteTextClass: completed ? 'Note-text completed-note' : 'Note-text',
      stickyNoteClass: completed ? 'sticky-note completed' : 'sticky-note',
      completeButtonClass: completed ? 'complete-icon-button completed' : 'complete-icon-button',
      hasReminder: false,
      notifyButtonClass: 'notify-icon-button',
      notificationIconSrc: noteNotfiyMeOffIcon,
      createdDisplay: this._fmtDate(n.CreatedDate),
      dueDisplay: n.Due_by__c ? this._fmtDate(n.Due_by__c) : null,
      recordName,          // Generic field name
      objectType,          // Object API name
      relatedRecordId: null,     // Will be filled by Apex lookup
    };
  }

  _fmtDate(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const month = (d.getMonth() + 1).toString().padStart(2, '0');
      const day = d.getDate().toString().padStart(2, '0');
      const year = d.getFullYear().toString().slice(-2);
      let hours = d.getHours();
      const minutes = d.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'pm' : 'am';
      hours = hours % 12 || 12;
      return `${month}/${day}/${year} ${hours}:${minutes}${ampm}`;
    } catch (e) {
      return iso;
    }
  }

  // --------------------------------------------------------------------------
  // Hydrate Record Links - Multi-Object Support
  // --------------------------------------------------------------------------
  _hydrateRecordLinks() {
    // Group notes by object type and collect unique canonical names
    const objectTypeToNames = {};
    const canonToOriginalByType = {};

    this.notes.forEach((n) => {
      const rawName = n.recordName;
      const objectType = n.objectType;
      
      if (!rawName || !objectType) return;
      
      const canonName = rawName.trim().toLowerCase();
      if (!canonName) return;

      // Initialize object type tracking
      if (!objectTypeToNames[objectType]) {
        objectTypeToNames[objectType] = [];
        canonToOriginalByType[objectType] = {};
      }

      // Track canonical to original name mapping
      if (!canonToOriginalByType[objectType][canonName]) {
        canonToOriginalByType[objectType][canonName] = rawName.trim();
        objectTypeToNames[objectType].push(rawName.trim());
      }
    });

    // If no records to look up, exit early
    if (Object.keys(objectTypeToNames).length === 0) return;

    // Call Apex to get batch results
    getBatchRecordIds({ objectTypeToNames })
      .then((batchResults) => {
        // batchResults is Map<String, Map<String, Id>>
        // objectType -> (recordName -> recordId)
        
        // Normalize results by object type and canonical name
        const normalizedResults = {};
        Object.keys(batchResults).forEach((objectType) => {
          const nameIdMap = batchResults[objectType];
          normalizedResults[objectType] = {};
          
          Object.keys(nameIdMap).forEach((rawName) => {
            const canonName = rawName.trim().toLowerCase();
            normalizedResults[objectType][canonName] = nameIdMap[rawName];
          });
        });

        // Apply to notes
        this.notes = this.notes.map((n) => {
          if (!n.recordName || !n.objectType) return n;
          
          const canonName = n.recordName.trim().toLowerCase();
          const objectResults = normalizedResults[n.objectType];
          const recordId = objectResults ? objectResults[canonName] : null;
          
          return recordId 
            ? { ...n, relatedRecordId: recordId }
            : n;
        });
      })
      .catch((err) => {
        console.error('getBatchRecordIds error', err);
      });
  }

  // --------------------------------------------------------------------------
  // Hydrate Reminder State
  // --------------------------------------------------------------------------
  _hydrateReminders() {
    this.notes.forEach((note, idx) => {
      NoteReminderExists({ userId: this.currentUserId, NoteId: note.Id })
        .then((exists) => {
          const updated = { ...note };
          updated.hasReminder = exists;
          updated.notifyButtonClass = exists
            ? 'notify-icon-button pressed-notification'
            : 'notify-icon-button';
          updated.notificationIconSrc = exists
            ? noteNotifyMeOnIcon
            : noteNotfiyMeOffIcon;
          this._replaceNote(idx, updated);
        })
        .catch((err) => {
          console.error('Reminder check error', err);
        });
    });
  }

  _replaceNote(index, updated) {
    this.notes = [
      ...this.notes.slice(0, index),
      updated,
      ...this.notes.slice(index + 1)
    ];
  }

  // --------------------------------------------------------------------------
  // Navigation - click on the sticky note
  // --------------------------------------------------------------------------
  handleNoteCardClick(event) {
    // Ignore clicks on interactive child controls
    const interactive = event.target.closest('button, a, lightning-button, lightning-input, lightning-textarea');
    if (interactive) return;

    // Grab record id from dataset
    const recordId = event.currentTarget.dataset.recordId;
    if (!recordId) return; // nothing to navigate to

    // Get the object API name from the note
    const noteId = event.currentTarget.dataset.noteId;
    let apiName = 'Company__c'; // fallback default
    
    if (noteId) {
      const note = this.notes.find((x) => x.Id === noteId);
      if (note && note.objectType) {
        apiName = note.objectType; // e.g., Company__c, Product2, Crucible__c, etc.
      }
    }

    this[NavigationMixin.Navigate]({
      type: 'standard__recordPage',
      attributes: {
        recordId,
        objectApiName: apiName,
        actionName: 'view'
      }
    });
  }

  // --------------------------------------------------------------------------
  // Getters
  // --------------------------------------------------------------------------
  get hasNotes() {
    return this.notes && this.notes.length > 0;
  }

  // --------------------------------------------------------------------------
  // Edit
  // --------------------------------------------------------------------------
  toggleEdit(e) {
    const id = e.currentTarget.dataset.id;
    this.notes = this.notes.map((n) =>
      n.Id === id ? { ...n, isEditing: !n.isEditing } : n
    );
  }

  handleEditChange(e) {
    const id = e.target.dataset.id;
    const txt = e.target.value;
    this.notes = this.notes.map((n) =>
      n.Id === id ? { ...n, Note_Text__c: txt } : n
    );
  }

  cancelEdit(e) {
    const id = e.currentTarget.dataset.id;
    this.notes = this.notes.map((n) =>
      n.Id === id ? { ...n, isEditing: false } : n
    );
  }

  saveUpdatedNote(e) {
    const id = e.currentTarget.dataset.id;
    const note = this.notes.find((n) => n.Id === id);
    if (!note) return;
    updateNoteText({ noteId: id, newText: note.Note_Text__c })
      .then(() => {
        this._toast('Success', 'Note updated.', 'success');
        this.notes = this.notes.map((n) =>
          n.Id === id ? { ...n, isEditing: false } : n
        );
        return refreshApex(this.wiredResult);
      })
      .catch((err) => {
        console.error('updateNoteText error', err);
        this._toast('Error', 'Failed to update note.', 'error');
      });
  }

  // --------------------------------------------------------------------------
  // Delete
  // --------------------------------------------------------------------------
  confirmDelete(e) {
    const id = e.currentTarget.dataset.id;
    this.notePendingDelete = this.notes.find((n) => n.Id === id);
    this.showDeleteModal = true;
  }

  cancelDelete() {
    this.showDeleteModal = false;
    this.notePendingDelete = null;
  }

  deleteNote() {
    if (!this.notePendingDelete) return;
    const id = this.notePendingDelete.Id;
    deleteNoteSrv({ noteId: id })
      .then(() => {
        this._toast('Deleted', 'Note deleted.', 'success');
        this.cancelDelete();
        return refreshApex(this.wiredResult);
      })
      .catch((err) => {
        console.error('deleteNote error', err);
        this._toast('Error', 'Failed to delete note.', 'error');
        this.cancelDelete();
      });
  }

  // --------------------------------------------------------------------------
  // Reminder bell
  // --------------------------------------------------------------------------
  toggleReminder(e) {
    const NoteId = e.currentTarget.dataset.id;
    const NoteIndex = this.notes.findIndex((n) => n.Id === NoteId);
    if (NoteIndex === -1) return;

    NoteReminderExists({ userId: this.currentUserId, NoteId })
      .then((exists) => {
        if (!exists) {
          createNoteReminder({ userId: this.currentUserId, NoteId })
            .then(() => {
              const updatedNote = { ...this.notes[NoteIndex] };
              updatedNote.hasReminder = true;
              updatedNote.notifyButtonClass = 'notify-icon-button pressed-notification';
              updatedNote.notificationIconSrc = noteNotifyMeOnIcon;
              this._replaceNote(NoteIndex, updatedNote);
              this._toast('Notification Enabled', 'You will be notified about this note.', 'success');
              refreshApex(this.wiredResult);
            })
            .catch((error) => {
              console.error('Error creating Note reminder:', error);
              this._toast('Error', 'Failed to enable notification.', 'error');
            });
        } else {
          removeNoteReminder({ userId: this.currentUserId, NoteId })
            .then(() => {
              const updatedNote = { ...this.notes[NoteIndex] };
              updatedNote.hasReminder = false;
              updatedNote.notifyButtonClass = 'notify-icon-button';
              updatedNote.notificationIconSrc = noteNotfiyMeOffIcon;
              this._replaceNote(NoteIndex, updatedNote);
              this._toast('Notification Disabled', 'You will no longer be notified about this note.', 'success');
              refreshApex(this.wiredResult);
            })
            .catch((error) => {
              console.error('Error removing Note reminder:', error);
              this._toast('Error', 'Failed to disable notification.', 'error');
            });
        }
      })
      .catch((error) => {
        console.error('Error checking Note reminder existence:', error);
      });
  }

  // --------------------------------------------------------------------------
  // Toast helper
  // --------------------------------------------------------------------------
  _toast(title, message, variant) {
    this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
  }

  getNoteCardStyle(note) {
    // show pointer only when we have an Id
    return note.relatedRecordId ? 'cursor:pointer;' : '';
  }
}