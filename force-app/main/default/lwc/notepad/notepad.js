import { LightningElement, api, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import USER_ID from '@salesforce/user/Id';
import { refreshApex } from '@salesforce/apex';

import getNotesForRecord from '@salesforce/apex/NoteController.getNotesForRecord';
import createNote from '@salesforce/apex/NoteController.createNote';
import updateNote from '@salesforce/apex/NoteController.updateNote';
import deleteNote from '@salesforce/apex/NoteController.deleteNote';
import updateNoteCompleteStatus from '@salesforce/apex/NoteController.updateNoteCompleteStatus';

import createNoteReminder from '@salesforce/apex/NoteReminderController.createNoteReminder';
import NoteReminderExists from '@salesforce/apex/NoteReminderController.NoteReminderExists';
import removeNoteReminder from '@salesforce/apex/NoteReminderController.removeNoteReminder';

import noteEditIcon from '@salesforce/resourceUrl/noteEditIcon';
import noteDeleteIcon from '@salesforce/resourceUrl/noteDeleteIcon';
import noteCompleteIcon from '@salesforce/resourceUrl/noteCompleteIcon';
import noteIsCompleteIcon from '@salesforce/resourceUrl/noteIsCompleteIcon';
import noteNotfiyMeOffIcon from '@salesforce/resourceUrl/noteNotfiyMeOffIcon';
import noteNotifyMeOnIcon from '@salesforce/resourceUrl/noteNotifyMeOnIcon';

export default class notepad extends LightningElement {
  @api recordId;
  @api objectApiName;
  currentUserId = USER_ID;

  Notes = [];
  NoteText = '';
  isAdding = false;
  isPublic = false; // for new notes
  wiredResult;

  showDeleteConfirmation = false;
  noteToDelete = null;

  formatCreatedDate(isoDateString) {
    if (!isoDateString) return '';
    const date = new Date(isoDateString);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const year = date.getFullYear().toString().slice(-2);
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12 || 12;
    return `${month}/${day}/${year} ${hours}:${minutes}${ampm}`;
  }

  @wire(getNotesForRecord, { recordId: '$recordId', objectApiName: '$objectApiName' })
  wiredNotes(result) {
    this.wiredResult = result;
    const { data, error } = result;
    if (data) {
      let mappedNotes = data.map(m => ({
        ...m,
        isEditing: false,
        isOwner: m.OwnerId === this.currentUserId,
        hasReminder: false,
        notificationIconSrc: this.noteNotfiyMeOffIcon,
        ownerName: m.Owner?.Name ?? (m.OwnerId ? 'Loading...' : 'Unknown User'),
        ownerFirstName: m.Owner?.FirstName || '',
        ownerLastName: m.Owner?.LastName || '',
        ownerPhotoUrl: m.Owner?.SmallBannerPhotoUrl || '',
        isCompleted: m.Completed__c || false,
        noteTextClass: m.Completed__c ? 'Note-text completed-note' : 'Note-text',
        stickyNoteClass: m.Completed__c ? 'sticky-note completed' : 'sticky-note',
        completeIconSrc: m.Completed__c ? this.noteIsCompleteIcon : this.noteCompleteIcon,
        completeButtonClass: m.Completed__c ? 'complete-icon-button completed' : 'complete-icon-button',
        CreatedDate: this.formatCreatedDate(m.CreatedDate),
        Public__c: m.Public__c || false
      }));
      this.Notes = mappedNotes;

      this.Notes.forEach((Note, index) => {
        NoteReminderExists({ userId: this.currentUserId, NoteId: Note.Id })
          .then(exists => {
            const updatedNote = { ...Note };
            updatedNote.hasReminder = exists;
            updatedNote.notificationIconSrc = exists ? this.noteNotifyMeOnIcon : this.noteNotfiyMeOffIcon;
            this.Notes = [
              ...this.Notes.slice(0, index),
              updatedNote,
              ...this.Notes.slice(index + 1)
            ];
          })
          .catch(error => {
            console.error('Error checking Note reminder existence for Note:', Note.Id, error);
          });
      });
    } else if (error) {
      console.error(error);
    }
  }

  startNewNote() {
    this.isAdding = true;
    this.isPublic = false;
  }

  cancelNote() {
    this.isAdding = false;
    this.NoteText = '';
    this.isPublic = false;
  }

  handleTextChange(event) {
    this.NoteText = event.target.value;
  }

  handlePublicChange(event) {
    const noteId = event.target.dataset.id;
    const isChecked = event.target.checked;

    if (noteId) {
      this.Notes = this.Notes.map(note => {
        if (note.Id === noteId) {
          return { 
            ...note,
            Public__c: isChecked // update actual field used in Apex and UI
          };
        }
        return note;
      });
    } else {
      this.isPublic = isChecked;
    }
  }





  saveNote() {
    if (!this.NoteText) return;

    createNote({
      recordId: this.recordId,
      objectApiName: this.objectApiName,
      text: this.NoteText,
      isPublic: this.isPublic
    })
      .then(() => {
        this.isAdding = false;
        this.NoteText = '';
        this.isPublic = false;
        return refreshApex(this.wiredResult);
      })
      .catch(err => console.error(err));
  }

  toggleEdit(event) {
    const id = event.currentTarget.dataset.id;
    this.Notes = this.Notes.map(Note => ({
      ...Note,
      isEditing: Note.Id === id ? !Note.isEditing : Note.isEditing
    }));
  }

  handleEditChange(event) {
    const id = event.target.dataset.id;
    const newText = event.target.value;

    this.Notes = this.Notes.map(Note => {
      if (Note.Id === id) {
        return { ...Note, Note_Text__c: newText };
      }
      return Note;
    });
  }

  saveUpdatedNote(event) {
  const id = event.currentTarget.dataset.id;
  const Note = this.Notes.find(m => m.Id === id);

  updateNote({
      NoteId: id,
      newText: Note.Note_Text__c,
      isPublic: Note.Public__c
    })
      .then(() => {
        this.Notes = this.Notes.map(m => ({
          ...m,
          isEditing: m.Id === id ? false : m.isEditing
        }));
        
        // REMOVE this line:
        // return refreshApex(this.wiredResult);

        this.dispatchEvent(new ShowToastEvent({
          title: 'Note Updated',
          message: 'Note was successfully saved.',
          variant: 'success'
        }));
      })
      .catch(error => console.error('Error saving Note:', error));
  }


  deleteNoteRecord(event) {
    const id = event.currentTarget.dataset.id;
    const note = this.Notes.find(n => n.Id === id);
    this.noteToDelete = note;
    this.showDeleteConfirmation = true;
  }

  confirmDelete() {
    if (this.noteToDelete) {
      deleteNote({ NoteId: this.noteToDelete.Id })
        .then(() => {
          this.showDeleteConfirmation = false;
          this.noteToDelete = null;
          return refreshApex(this.wiredResult);
        })
        .catch(error => {
          console.error('Error deleting Note:', error);
          this.showDeleteConfirmation = false;
          this.noteToDelete = null;

          this.dispatchEvent(new ShowToastEvent({
            title: 'Error',
            message: 'Failed to delete note.',
            variant: 'error'
          }));
        });
    }
  }

  cancelDelete() {
    this.showDeleteConfirmation = false;
    this.noteToDelete = null;
  }

  handleNotifyMe(event) {
    const NoteId = event.currentTarget.dataset.id;
    const NoteIndex = this.Notes.findIndex(Note => Note.Id === NoteId);
    if (NoteIndex === -1) return;

    NoteReminderExists({ userId: this.currentUserId, NoteId })
      .then(exists => {
        if (!exists) {
          createNoteReminder({ userId: this.currentUserId, NoteId })
            .then(() => {
              const updatedNote = { ...this.Notes[NoteIndex] };
              updatedNote.hasReminder = true;
              updatedNote.notificationIconSrc = this.noteNotifyMeOnIcon;
              this.Notes = [
                ...this.Notes.slice(0, NoteIndex),
                updatedNote,
                ...this.Notes.slice(NoteIndex + 1)
              ];
              this.dispatchEvent(new ShowToastEvent({
                title: 'Notification Enabled',
                message: 'You will be notified about this note.',
                variant: 'success'
              }));
              refreshApex(this.wiredResult);
            })
            .catch(error => {
              console.error("Error creating Note reminder:", error);
              this.dispatchEvent(new ShowToastEvent({
                title: 'Error',
                message: 'Failed to enable notification.',
                variant: 'error'
              }));
            });
        } else {
          removeNoteReminder({ userId: this.currentUserId, NoteId })
            .then(() => {
              const updatedNote = { ...this.Notes[NoteIndex] };
              updatedNote.hasReminder = false;
              updatedNote.notificationIconSrc = this.noteNotfiyMeOffIcon;
              this.Notes = [
                ...this.Notes.slice(0, NoteIndex),
                updatedNote,
                ...this.Notes.slice(NoteIndex + 1)
              ];
              this.dispatchEvent(new ShowToastEvent({
                title: 'Notification Disabled',
                message: 'You will no longer be notified about this note.',
                variant: 'success'
              }));
              refreshApex(this.wiredResult);
            })
            .catch(error => {
              console.error("Error removing Note reminder:", error);
              this.dispatchEvent(new ShowToastEvent({
                title: 'Error',
                message: 'Failed to disable notification.',
                variant: 'error'
              }));
            });
        }
      })
      .catch(error => {
        console.error("Error checking Note reminder existence:", error);
      });
  }

  handleComplete(event) {
    const id = event.currentTarget.dataset.id;
    const currentNote = this.Notes.find(note => note.Id === id);
    const newCompletionStatus = !currentNote.isCompleted;

    this.Notes = this.Notes.map(note => {
      if (note.Id === id) {
        return {
          ...note,
          isCompleted: newCompletionStatus,
          noteTextClass: newCompletionStatus ? 'Note-text completed-note' : 'Note-text',
          stickyNoteClass: newCompletionStatus ? 'sticky-note completed' : 'sticky-note',
          completeIconSrc: newCompletionStatus ? this.noteIsCompleteIcon : this.noteCompleteIcon,
          completeButtonClass: newCompletionStatus ? 'complete-icon-button completed' : 'complete-icon-button'
        };
      }
      return note;
    });

    updateNoteCompleteStatus({ noteId: id, status: newCompletionStatus })
      .then(() => {
        this.dispatchEvent(new ShowToastEvent({
          title: 'Note Updated',
          message: `Note successfully ${newCompletionStatus ? 'completed' : 'uncompleted'}.`,
          variant: 'success'
        }));
      })
      .catch(error => {
        console.error('Error updating note completion status:', error);
        this.dispatchEvent(new ShowToastEvent({
          title: 'Error',
          message: 'Failed to update note completion status',
          variant: 'error'
        }));
      });
  }

  get editNoteIcon() {
    return noteEditIcon;
  }

  get deleteNoteIcon() {
    return noteDeleteIcon;
  }

  get noteCompleteIcon() {
    return noteCompleteIcon;
  }

  get noteIsCompleteIcon() {
    return noteIsCompleteIcon;
  }

  get noteNotfiyMeOffIcon() {
    return noteNotfiyMeOffIcon;
  }

  get noteNotifyMeOnIcon() {
    return noteNotifyMeOnIcon;
  }
}