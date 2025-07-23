const { cancelInvoiceById, cancelSystemGeneratedInvoices } = require("./billGenerator.js");
const { invoiceQueue } = require("./jobFunction.js");

// Function to add a cancellation job to the queue

async function cancelSystemGenInvoices(req, res) {
  const { invoiceId } = req.params; // Get the invoice ID from route parameters
  const tenantId = req.user?.tenantId; // Extract tenantId from authenticated user

  if (!tenantId) {
    return res.status(403).json({ message: 'Tenant ID is required to cancel invoices.' });
  }

  try {
    // Retrieve the invoice details to verify ownership
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { tenantId: true, status: true, isSystemGenerated: true },
    });

    // Check if the invoice exists
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found.' });
    }

    // Verify that the invoice belongs to the authenticated tenant
    if (invoice.tenantId !== tenantId) {
      return res.status(403).json({ message: 'Access denied: You do not own this invoice.' });
    }

    // Ensure the invoice is system-generated and not already cancelled
    if (!invoice.isSystemGenerated) {
      return res.status(400).json({ message: 'Only system-generated invoices can be cancelled.' });
    }

    if (invoice.status === 'CANCELLED') {
      return res.status(400).json({ message: 'Invoice is already cancelled.' });
    }

    // Add the job to the queue
    await invoiceQueue.add('cancelInvoice', { invoiceId });
    return res.status(200).json({ message: 'Cancellation job added to the queue.' });
  } catch (error) {
    console.error('Error adding cancellation job to the queue:', error);
    return res.status(500).json({ error: 'Failed to add cancellation job to the queue.' });
  }
}



// Process the job
invoiceQueue.process('cancelInvoice', async (job) => {
  const { invoiceId } = job.data; // Get the invoice ID from job data
  try {
    const result = await cancelSystemGeneratedInvoices(); // Call the function to cancel the invoice
    console.log(`Invoice ${invoiceId} cancellation processed successfully.`);
    return result; // Return the result for logging purposes
  } catch (error) {
    console.error(`Error processing cancellation job for invoice ${invoiceId}:`, error);
    throw error; // Re-throw error to be handled by Bull
  }
});

// Export the cancelInvoiceByIdJob function
module.exports = { cancelSystemGenInvoices };
