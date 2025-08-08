public with sharing class NotepadDashboardController {

    @AuraEnabled(cacheable=true)
    public static Map<String, Id> getCompanyIdsByNames(List<String> names) {
        Map<String, Id> result = new Map<String, Id>();
        if (names == null || names.isEmpty()) {
            return result;
        }

        // Dedup incoming names (case-sensitive; adjust if needed)
        Set<String> nameSet = new Set<String>(names);

        for (Company__c c : [
            SELECT Id, Name
            FROM Company__c
            WHERE Name IN :nameSet
        ]) {
            // Only store the first Id if duplicate names exist
            if (!result.containsKey(c.Name)) {
                result.put(c.Name, c.Id);
            }
        }
        return result;
    }

    // NEW METHOD: Generic record lookup by object type and names
    @AuraEnabled(cacheable=true)
    public static Map<String, Id> getRecordIdsByNamesAndType(List<String> names, String objectType) {
        Map<String, Id> result = new Map<String, Id>();
        if (names == null || names.isEmpty() || String.isBlank(objectType)) {
            return result;
        }

        // Dedup incoming names
        Set<String> nameSet = new Set<String>(names);
        
        // Build dynamic SOQL
        String soql = 'SELECT Id, Name FROM ' + String.escapeSingleQuotes(objectType) + ' WHERE Name IN :nameSet';
        
        try {
            List<SObject> records = Database.query(soql);
            for (SObject record : records) {
                String recordName = (String) record.get('Name');
                Id recordId = (Id) record.get('Id');
                if (!result.containsKey(recordName)) {
                    result.put(recordName, recordId);
                }
            }
        } catch (Exception e) {
            System.debug('Error querying ' + objectType + ': ' + e.getMessage());
            // Return empty map on error rather than throwing exception
        }
        
        return result;
    }

    // NEW METHOD: Batch lookup for multiple object types
    @AuraEnabled(cacheable=true)
    public static Map<String, Map<String, Id>> getBatchRecordIds(Map<String, List<String>> objectTypeToNames) {
        Map<String, Map<String, Id>> result = new Map<String, Map<String, Id>>();
        
        if (objectTypeToNames == null || objectTypeToNames.isEmpty()) {
            return result;
        }
        
        for (String objectType : objectTypeToNames.keySet()) {
            List<String> names = objectTypeToNames.get(objectType);
            Map<String, Id> nameToIdMap = getRecordIdsByNamesAndType(names, objectType);
            result.put(objectType, nameToIdMap);
        }
        
        return result;
    }

    @AuraEnabled(cacheable=true)
    public static List<Note__c> getMyNotes(Boolean includeCompleted, Integer maxRecords) {
        Id uid = UserInfo.getUserId();
        Integer lim = (maxRecords == null || maxRecords <= 0 || maxRecords > 200) ? 50 : maxRecords;

        Boolean showCompleted = (includeCompleted == true);

        if (showCompleted) {
            return [
                SELECT Id, Name, Note_Text__c, Completed__c, Due_by__c, Created_Time__c,
                       CreatedDate, OwnerId, Owner.Name, Owner.FirstName, Owner.LastName, 
                       TargetObjectName__c, TargetObjectType__c
                FROM Note__c
                WHERE CreatedById = :uid
                ORDER BY Due_by__c NULLS LAST, CreatedDate DESC
                LIMIT :lim
            ];
        } else {
            return [
                SELECT Id, Name, Note_Text__c, Completed__c, Due_by__c, Created_Time__c,
                       CreatedDate, OwnerId, Owner.Name, Owner.FirstName, Owner.LastName, 
                       TargetObjectName__c, TargetObjectType__c
                FROM Note__c
                WHERE CreatedById = :uid
                  AND (Completed__c = FALSE OR Completed__c = NULL)
                ORDER BY Due_by__c NULLS LAST, CreatedDate DESC
                LIMIT :lim
            ];
        }
    }

    @AuraEnabled
    public static void updateNoteText(Id noteId, String newText) {
        if (noteId == null || String.isBlank(newText)) {
            throw new AuraHandledException('Note ID and text are required.');
        }
        Note__c n = [SELECT Id FROM Note__c WHERE Id = :noteId LIMIT 1];
        n.Note_Text__c = newText;
        update n;
    }

    @AuraEnabled
    public static void toggleComplete(Id noteId) {
        if (noteId == null) {
            throw new AuraHandledException('Note ID is required.');
        }
        Note__c n = [SELECT Id, Completed__c FROM Note__c WHERE Id = :noteId LIMIT 1];
        n.Completed__c = (n.Completed__c == true) ? false : true;
        update n;
    }

    @AuraEnabled
    public static void deleteNote(Id noteId) {
        if (noteId == null) {
            throw new AuraHandledException('Note ID is required.');
        }
        delete [SELECT Id FROM Note__c WHERE Id = :noteId LIMIT 1];
    }

    @AuraEnabled(cacheable=true)
    public static Boolean NoteReminderExists(Id userId, Id noteId) {
        Id uId = (userId != null) ? userId : UserInfo.getUserId();
        return [SELECT COUNT() FROM Note_Reminder__c
                WHERE User__c = :uId AND Note__c = :noteId] > 0;
    }

    @AuraEnabled
    public static void createNoteReminder(Id userId, Id noteId) {
        Id uId = (userId != null) ? userId : UserInfo.getUserId();
        if (noteId == null) throw new AuraHandledException('NoteId is required');
        Note_Reminder__c reminder = new Note_Reminder__c(
            Name = 'Reminder for ' + noteId,
            Note__c = noteId,
            User__c = uId
        );
        insert reminder;
    }

    @AuraEnabled
    public static void removeNoteReminder(Id userId, Id noteId) {
        Id uId = (userId != null) ? userId : UserInfo.getUserId();
        List<Note_Reminder__c> reminders = [SELECT Id FROM Note_Reminder__c
                                            WHERE User__c = :uId AND Note__c = :noteId];
        delete reminders;
    }
}