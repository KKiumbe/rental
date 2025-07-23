const attachPaymentToCustomer = async (req, res) => {
  const { paymentId, customerId } = req.params;

  try {
    // Fetch the payment
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    if (payment.receipted) {
      return res.status(400).json({ message: 'Payment has already been receipted.' });
    }

    // Find unpaid invoices for the customer
    const unpaidInvoices = await prisma.invoice.findMany({
      where: {
        customerId: customerId,
        status: 'UNPAID',
      },
    });

    let remainingAmount = payment.amount;
    const receiptInvoices = [];
    let totalPaid = 0;

    if (unpaidInvoices.length === 0) {
      // No unpaid invoices, mark the payment as overpayment
      await prisma.customer.update({
        where: { id: customerId },
        data: {
          closingBalance: { increment: remainingAmount }, // Overpayment added to closing balance
        },
      });

      // Mark the payment as receipted and overpayment
      await prisma.payment.update({
        where: { id: paymentId },
        data: {
          receipted: true,
          receiptId: null, // No associated receipt with invoices, only overpayment
        },
      });

      return res.json({ message: 'Payment processed as overpayment. No pending invoices.' });
    }

    for (const invoice of unpaidInvoices) {
      const receivableAmount = Math.min(invoice.invoiceAmount - invoice.amountPaid, remainingAmount);
      if (receivableAmount > 0) {
        receiptInvoices.push({
          invoiceId: invoice.id,
          amount: receivableAmount,
        });

        remainingAmount -= receivableAmount;
        totalPaid += receivableAmount;

        // Update the invoice's amountPaid and status
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            amountPaid: { increment: receivableAmount },
            status: receivableAmount >= invoice.invoiceAmount ? 'PAID' : 'UNPAID',
          },
        });
      }

      if (remainingAmount <= 0) break; // Stop if no remaining amount to apply
    }

    // Create the receipt for the paid invoices
    const receipt = await prisma.receipt.create({
      data: {
        receiptNumber: generateReceiptNumber(),
        amount: totalPaid,
        modeOfPayment: payment.modeOfPayment,
        customerId: customerId,
        paymentId: payment.id,
        receiptInvoices: {
          create: receiptInvoices.map((ri) => ({
            invoiceId: ri.invoiceId,
          })),
        },
      },
    });

    // Mark the payment as receipted
    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        receipted: true,
        receiptId: receipt.id,
      },
    });

    // Update customer's closing balance by subtracting the total paid amount
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    let newClosingBalance = customer.closingBalance - totalPaid;

    // Handle overpayment if remainingAmount is still greater than 0
    if (remainingAmount > 0) {
      newClosingBalance += remainingAmount; // Overpayment added to closing balance
      await prisma.customer.update({
        where: { id: customerId },
        data: {
          closingBalance: newClosingBalance,
        },
      });
      res.json({ message: 'Payment applied to invoices with overpayment recorded.', receipt, overpayment: remainingAmount });
    } else {
      // No overpayment, just update the balance
      await prisma.customer.update({
        where: { id: customerId },
        data: {
          closingBalance: newClosingBalance,
        },
      });
      res.json({ message: 'Payment applied to invoices and balance updated.', receipt });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error attaching payment to customer', error: error.message });
  }
};
