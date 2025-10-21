// Copyright (c) 2024, manoj and contributors
// For license information, please see license.txt

frappe.ui.form.on('Ding Call Logs', {
    onload: function (frm) {
        // Set call_handler to current user
        frm.set_value('call_handler', frappe.session.user);

        // Set start_time to current time
        frm.set_value('start_time', frappe.datetime.now_datetime());
    },

    before_save: function (frm) {
        // Set end_time to current time before saving
        frm.set_value('end_time', frappe.datetime.now_datetime());

        // Calculate duration
        var start_time = frm.doc.start_time ? moment(frm.doc.start_time) : moment();
        var end_time = moment();
        var duration = moment.duration(end_time.diff(start_time));
        var durationFormatted = moment.utc(duration.asMilliseconds()).format('mm:ss');
        frm.set_value('duration', durationFormatted);
    },

    refresh: function (frm) {
 
        // Check if mobile_number is present in the lead doctype
        if (frm.doc.mobile_no) {
            frm.add_custom_button(__('Ding Mobile'), function () {
                // Play the sound
                playNotificationSound();
                // Trigger the call without opening a new tab
                window.location.href = 'tel:' + frm.doc.mobile_no;
            });

            frm.add_custom_button(__('<i class="fa fa-whatsapp"></i> Mobile'), function () {
                // Open WhatsApp chat for mobile number
                window.open('https://wa.me/' + frm.doc.mobile_no, '_blank');
            });
        }

        // Check if phone is present in the doctype
        if (frm.doc.phone) {
            frm.add_custom_button(__('Ding Phone'), function () {
                // Play the sound
                playNotificationSound();
                // Trigger the call without opening a new tab
                window.location.href = 'tel:' + frm.doc.phone;
            });

            frm.add_custom_button(__('<i class="fa fa-whatsapp"></i> Phone'), function () {
                // Open WhatsApp chat for phone number
                window.open('https://wa.me/' + frm.doc.phone, '_blank');
            });
        }
    }

});

cur_frm.cscript.disposition = function (doc, cdt, cdn) {
    // Get the selected value from the Disposition field
    var disposition = doc.disposition;
    // Get the "Action Package" field
    var actionPackageField = cur_frm.fields_dict['action_package'].$wrapper;
    // Clear existing content in the "Action Package" field
    actionPackageField.empty();
    // Define HTML content based on the selected disposition
    var htmlContent = '';
    // Add your switch cases here
    switch (disposition) {
        case 'Successful':
            htmlContent = '<h4>Successful</h4>' +
                '<ol>' +
                '<li>Sample Sent</li>' +
                '<li>Product Details Shared via Email</li>' +
                '<li>Product Brochure Sent</li>' +
                '<li>Catalogue Shared</li>' +
                '<li>Product Images Sent via WhatsApp</li>' +
                '<li>Product Images Sent via Email</li>' +
                '<li>Pricing Details Shared</li>' +
                '<li>Quotation Provided</li>' +
                '<li>Follow-up Meeting Scheduled</li>' +
                '<li>Demo Scheduled</li>' +
                '<li>Trial Offer Provided</li>' +
                '<li>Order Placed</li>' +
                '<li>Contract Signed</li>' +
                '</ol>';
            break;
        // Add more cases for other dispositions as needed

        case 'Existing Customer - Upgrading Plan':
            htmlContent = '<h4>Existing Customer - Upgrading Plan</h4>' +
                '<ol>' +
                '<li>Discussed Upgrade Options</li>' +
                '<li>Sent Pricing Details for Upgrade</li>' +
                '<li>Scheduled Follow-up Meeting for Demo</li>' +
                '<li>Sent Follow-up Email with Upgrade Information</li>' +
                '<li>Sent Follow-up WhatsApp Message with Upgrade Information</li>' +
                '<li>Sent Follow-up SMS with Upgrade Information</li>' +
                '</ol>';
            break;
        // Add more cases for other dispositions as needed



        case 'Interested but Needs More Information':
            htmlContent = '<h4>Interested but Needs More Information</h4>' +
                '<ol>' +
                '<li>Sent Detailed Product Information</li>' +
                '<li>Provided Case Studies</li>' +
                '<li>Offered Free Trial</li>' +
                '<li>Scheduled Follow-up Call</li>' +
                '<li>Scheduled Follow-up Meeting</li>' +
                '<li>Sent Follow-up Email</li>' +
                '<li>Sent Follow-up WhatsApp Message</li>' +
                '<li>Sent Follow-up SMS</li>' +
                '</ol>';
            break;
        // Add more cases for other dispositions as needed



        case 'Interested & Wants to Proceed Slowly':
            htmlContent = '<h4>Interested & Wants to Proceed Slowly</h4>' +
                '<ol>' +
                '<li>Scheduled Follow-up Meeting</li>' +
                '<li>Offered Trial Period</li>' +
                '<li>Provided Basic Package Information</li>' +
                '<li>Sent Follow-up Email</li>' +
                '<li>Sent Follow-up WhatsApp Message</li>' +
                '<li>Sent Follow-up SMS</li>' +
                '</ol>';
            break;
        // Add more cases for other dispositions as needed



        case 'Follow-up Needed':
            htmlContent = '<h4>Follow-up Needed</h4>' +
                '<ol>' +
                '<li>Follow-up Call Scheduled</li>' +
                '<li>Follow-up Meeting Scheduled</li>' +
                '<li>Sent Follow-up Email</li>' +
                '<li>Sent Follow-up WhatsApp Message</li>' +
                '<li>Sent Follow-up SMS</li>' +
                '<li>Provided Additional Information</li>' +
                '<li>Sent Updated Proposal</li>' +
                '<li>Sent Additional Resources</li>' +
                '<li>Sent Reminder</li>' +
                '</ol>';
            break;
        // Add more cases for other dispositions as needed



        case 'Existing Customer - Renewal Reminder':
            htmlContent = '<h4>Existing Customer - Renewal Reminder</h4>' +
                '<ol>' +
                '<li>Sent Renewal Reminder</li>' +
                '<li>Discussed Renewal Benefits</li>' +
                '<li>Scheduled Follow-up Meeting for Renewal</li>' +
                '<li>Sent Follow-up Email for Renewal</li>' +
                '<li>Sent Follow-up WhatsApp Message for Renewal</li>' +
                '<li>Sent Follow-up SMS for Renewal</li>' +
                '</ol>';
            break;
        // Add more cases for other dispositions as needed



        case 'Not Available Now. Call Later':
            htmlContent = '<h4>Not Available Now. Call Later</h4>' +
                '<ol>' +
                '<li>Scheduled Callback</li>' +
                '<li>Noted Best Time to Call</li>' +
                '<li>Sent Reminder for Callback</li>' +
                '<li>Sent Follow-up Email</li>' +
                '<li>Sent Follow-up WhatsApp Message</li>' +
                '<li>Sent Follow-up SMS</li>' +
                '</ol>';
            break;
        // Add more cases for other dispositions as needed



        case 'Needs Approval from Higher Authority':
            htmlContent = '<h4>Needs Approval from Higher Authority</h4>' +
                '<ol>' +
                '<li>Sent Detailed Proposal for Review</li>' +
                '<li>Scheduled Follow-up Meeting with Decision Maker</li>' +
                '<li>Provided Contact Details of Decision Maker</li>' +
                '<li>Sent Follow-up Email to Decision Maker</li>' +
                '<li>Sent Follow-up WhatsApp Message to Decision Maker</li>' +
                '<li>Sent Follow-up SMS to Decision Maker</li>' +
                '</ol>';
            break;
        // Add more cases for other dispositions as needed



        case 'Callback Requested':
            htmlContent = '<h4>Callback Requested</h4>' +
                '<ol>' +
                '<li>Scheduled Callback</li>' +
                '<li>Sent Confirmation Email</li>' +
                '<li>Sent Confirmation WhatsApp Message</li>' +
                '<li>Sent Confirmation SMS</li>' +
                '<li>Sent Reminder</li>' +
                '</ol>';
            break;
        // Add more cases for other dispositions as needed



        case 'Left Voicemail':
            htmlContent = '<h4>Left Voicemail</h4>' +
                '<ol>' +
                '<li>Sent Follow-up Email</li>' +
                '<li>Sent Follow-up WhatsApp Message</li>' +
                '<li>Sent Follow-up SMS</li>' +
                '<li>Scheduled Callback</li>' +
                '<li>Attempted Callback Again</li>' +
                '<li>Sent Reminder</li>' +
                '</ol>';
            break;
        // Add more cases for other dispositions as needed



        case 'Language Barrier':
            htmlContent = '<h4>Language Barrier</h4>' +
                '<ol>' +
                '<li>Identified Language Preference</li>' +
                '<li>Provided Information in Preferred Language</li>' +
                '<li>Offered Translation Services</li>' +
                '<li>Scheduled Follow-up Call with Translator</li>' +
                '<li>Sent Follow-up Email in Preferred Language</li>' +
                '<li>Sent Follow-up WhatsApp Message in Preferred Language</li>' +
                '<li>Sent Follow-up SMS in Preferred Language</li>' +
                '</ol>';
            break;
        // Add more cases for other dispositions as needed



        case 'Already Engaged with Competitor':
            htmlContent = '<h4>Already Engaged with Competitor</h4>' +
                '<ol>' +
                '<li>Updated Lead Details</li>' +
                '<li>Noted Competitor Details</li>' +
                '<li>Provided Differentiating Information</li>' +
                '<li>Offered Special Incentives to Switch</li>' +
                '<li>Scheduled Follow-up Call to Reassess</li>' +
                '<li>Sent Follow-up Email with Comparative Analysis</li>' +
                '<li>Sent Follow-up WhatsApp Message with Comparative Analysis</li>' +
                '</ol>';
            break;
        // Add more cases for other dispositions as needed



        case 'Technical Objection':
            htmlContent = '<h4>Technical Objection</h4>' +
                '<ol>' +
                '<li>Noted Technical Concerns</li>' +
                '<li>Scheduled Technical Discussion</li>' +
                '<li>Provided Technical Documentation</li>' +
                '<li>Offered Technical Support</li>' +
                '<li>Sent Follow-up Email with Technical Solutions</li>' +
                '<li>Sent Follow-up WhatsApp Message with Technical Solutions</li>' +
                '<li>Sent Follow-up SMS with Technical Solutions</li>' +
                '</ol>';
            break;
        // Add more cases for other dispositions as needed



        case 'Budget Constraints':
            htmlContent = '<h4>Budget Constraints</h4>' +
                '<ol>' +
                '<li>Noted Budget Limitations</li>' +
                '<li>Offered Flexible Payment Options</li>' +
                '<li>Provided Budget-Friendly Alternatives</li>' +
                '<li>Scheduled Follow-up Call to Revisit Budget</li>' +
                '<li>Sent Follow-up Email with Cost-Saving Tips</li>' +
                '<li>Sent Follow-up WhatsApp Message with Cost-Saving Tips</li>' +
                '<li>Sent Follow-up SMS with Cost-Saving Tips</li>' +
                '</ol>';
            break;
        // Add more cases for other dispositions as needed



        case 'Policy Restrictions':
            htmlContent = '<h4>Policy Restrictions</h4>' +
                '<ol>' +
                '<li>Noted Policy Constraints</li>' +
                '<li>Offered Compliance Solutions</li>' +
                '<li>Provided Policy Clarifications</li>' +
                '<li>Scheduled Follow-up Call with Legal Team</li>' +
                '<li>Sent Follow-up Email with Policy Options</li>' +
                '<li>Sent Follow-up WhatsApp Message with Policy Options</li>' +
                '<li>Sent Follow-up SMS with Policy Options</li>' +
                '</ol>';
            break;
        // Add more cases for other dispositions as needed



        case 'Seeking Custom Solution':
            htmlContent = '<h4>Seeking Custom Solution</h4>' +
                '<ol>' +
                '<li>Discussed Customization Requirements</li>' +
                '<li>Scheduled Customization Consultation</li>' +
                '<li>Provided Customization Portfolio</li>' +
                '<li>Offered Customization Pricing</li>' +
                '<li>Sent Follow-up Email with Customization Options</li>' +
                '<li>Sent Follow-up WhatsApp Message with Customization Options</li>' +
                '<li>Sent Follow-up SMS with Customization Options</li>' +
                '</ol>';
            break;
        // Add more cases for other dispositions as needed



        case 'Client Dissatisfaction':
            htmlContent = '<h4>Client Dissatisfaction</h4>' +
                '<ol>' +
                '<li>Addressed Concerns and Complaints</li>' +
                '<li>Offered Apology and Resolution</li>' +
                '<li>Escalated to Customer Support Team</li>' +
                '<li>Provided Compensation or Refund</li>' +
                '<li>Scheduled Follow-up Call to Ensure Satisfaction</li>' +
                '<li>Sent Follow-up Email with Resolution Details</li>' +
                '<li>Sent Follow-up WhatsApp Message with Resolution Details</li>' +
                '</ol>';
            break;
        // Add more cases for other dispositions as needed



        case 'Unsuccessful':
            htmlContent = '<h4>Unsuccessful</h4>' +
                '<ol>' +
                '<li>Product Information Shared via Email</li>' +
                '<li>Product Brochure Sent</li>' +
                '<li>Catalogue Shared</li>' +
                '<li>Pricing Details Shared</li>' +
                '<li>Quotation Provided</li>' +
                '<li>Follow-up Call Scheduled</li>' +
                '<li>Follow-up Meeting Scheduled</li>' +
                '<li>Demo Scheduled</li>' +
                '<li>Trial Offer Provided</li>' +
                '<li>Not Interested</li>' +
                '<li>Will Consider in Future</li>' +
                '<li>No Budget Available</li>' +
                '<li>Decision Deferred</li>' +
                '<li>Competitor Preferred</li>' +
                '<li>Wrong Contact Person</li>' +
                '</ol>';
            break;
        // Add more cases for other dispositions as needed



        case 'Lost Opportunity - Reason Unknown':
            htmlContent = '<h4>Lost Opportunity - Reason Unknown</h4>' +
                '<ol>' +
                '<li>Sent Follow-up Email to Inquire Reason for No Interest</li>' +
                '<li>Sent Follow-up WhatsApp Message to Inquire Reason for No Interest</li>' +
                '<li>Sent Follow-up SMS to Inquire Reason for No Interest</li>' +
                '<li>Marked for Future Follow-up</li>' +
                '<li>Removed from Immediate Follow-up List</li>' +
                '</ol>';
            break;
        // Add more cases for other dispositions as needed



        case 'Not Qualified':
            htmlContent = '<h4>Not Qualified</h4>' +
                '<ol>' +
                '<li>Marked as Not Qualified</li>' +
                '<li>Updated Lead Status to Not Qualified</li>' +
                '<li>Removed from Sales Pipeline</li>' +
                '<li>Added to Nurture Campaign</li>' +
                '<li>Sent Follow-up Email with Resources for Self-Education</li>' +
                '<li>Sent Follow-up WhatsApp Message with Resources for Self-Education</li>' +
                '<li>Sent Follow-up SMS with Resources for Self-Education</li>' +
                '</ol>';
            break;
        // Add more cases for other dispositions as needed



        case 'Not Reachable':
            htmlContent = '<h4>Not Reachable</h4>' +
                '<ol>' +
                '<li>Sent Follow-up Email</li>' +
                '<li>Sent Follow-up WhatsApp Message</li>' +
                '<li>Sent Follow-up SMS</li>' +
                '<li>Attempted Callback Again</li>' +
                '<li>Scheduled Callback</li>' +
                '</ol>';
            break;
        // Add more cases for other dispositions as needed



        case 'Busy Line':
            htmlContent = '<h4>Busy Line</h4>' +
                '<ol>' +
                '<li>Attempted Callback</li>' +
                '<li>Sent Follow-up Email</li>' +
                '<li>Sent Follow-up WhatsApp Message</li>' +
                '<li>Sent Follow-up SMS</li>' +
                '<li>Rescheduled Call</li>' +
                '</ol>';
            break;
        // Add more cases for other dispositions as needed



        case 'Invalid Number':
            htmlContent = '<h4>Invalid Number</h4>' +
                '<ol>' +
                '<li>Verify Number</li>' +
                '<li>Update Contact Details</li>' +
                '<li>Sent Follow-up Email</li>' +
                '<li>Sent Follow-up WhatsApp Message</li>' +
                '<li>Sent Follow-up SMS</li>' +
                '<li>Attempted Callback with Alternative Number</li>' +
                '</ol>';
            break;
        // Add more cases for other dispositions as needed



        case 'Do Not Call':
            htmlContent = '<h4>Do Not Call</h4>' +
                '<ol>' +
                '<li>Marked as DNC</li>' +
                '<li>Update DNC List</li>' +
                '<li>Sent DNC Confirmation Email</li>' +
                '<li>Sent DNC Confirmation WhatsApp Message</li>' +
                '<li>Sent DNC Confirmation SMS</li>' +
                '<li>Added to DNC Campaign</li>' +
                '</ol>';
            break;
        // Add more cases for other dispositions as needed



        case 'Wrong Number':
            htmlContent = '<h4>Wrong Number</h4>' +
                '<ol>' +
                '<li>Updated Contact Details</li>' +
                '<li>Marked Number as Invalid</li>' +
                '<li>Verified Correct Contact Details</li>' +
                '<li>Attempted Callback with Correct Number</li>' +
                '<li>Sent Follow-up Email for Confirmation</li>' +
                '<li>Sent Follow-up WhatsApp Message for Confirmation</li>' +
                '<li>Sent Follow-up SMS for Confirmation</li>' +
                '</ol>';
            break;
        // Add more cases for other dispositions as needed

        case 'Not in Service Area':
            htmlContent = '<h4>Not in Service Area</h4>' +
                '<ol>' +
                '<li>Updated Lead Details</li>' +
                '<li>Marked as Out of Service Area</li>' +
                '<li>Provided Referral to Partner or Associate in Service Area</li>' +
                '<li>Sent Follow-up Email with Referral Details</li>' +
                '<li>Sent Follow-up WhatsApp Message with Referral Details</li>' +
                '<li>Sent Follow-up SMS with Referral Details</li>' +
                '</ol>';
            break;
        // Add more cases for other dispositions as needed

    }
    // Set HTML content to the "Action Package" field
    actionPackageField.html(htmlContent);
};


// Function to play the notification sound
function playNotificationSound() {
    var audio = new Audio('public/ding.mp3');
    audio.play();
}
