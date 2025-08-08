public with sharing class NoteReminderController {

    @AuraEnabled
    public static Id createNoteReminder(Id userId, Id NoteId) {
        try {
            Note_Reminder__c Reminder = new Note_Reminder__c();
            Reminder.User__c = userId;
            Reminder.Note__c = NoteId;
            insert Reminder;
            return Reminder.Id;
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }

    @AuraEnabled
    public static Id removeNoteReminder(Id userId, Id NoteId){
        try {
            Note_Reminder__c Reminder = [SELECT Id, User__c, Note__c FROM Note_Reminder__c WHERE User__c =:userId AND Note__c =:NoteId LIMIT 1];
            delete Reminder;
            return Reminder.Id;
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }

    @AuraEnabled
    public static Boolean NoteReminderExists(Id userId, Id NoteId) {
        if (userId == null || NoteId == null) {
            throw new AuraHandledException('UserId and NoteID Required For NoteReminder Lookup');
        }
        // Check if the {)
        List<Note_Reminder__c> reminders = [
            SELECT Id
            FROM Note_Reminder__c
            WHERE User__c = :userId
            AND Note__c = :NoteId
            LIMIT 1
        ];

        return !reminders.isEmpty();
    }

}