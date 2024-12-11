const express = require('express');
const stripe = require('stripe')('sua_chave_secreta_stripe');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Armazenar usuários Pro (em produção, use um banco de dados)
const proUsers = new Set();

// Endpoint para criar sessão de checkout
app.post('/create-checkout-session', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'brl',
            product_data: {
              name: 'ClipMaster Pro',
              description: 'Acesso a todos os recursos premium do ClipMaster',
            },
            unit_amount: 2990, // R$29.90
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: 'chrome-extension://sua-extension-id/success.html',
      cancel_url: 'chrome-extension://sua-extension-id/popup.html',
    });

    res.json({ id: session.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Webhook do Stripe para processar eventos
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      'seu_webhook_secret'
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    proUsers.add(session.customer);
  }

  res.json({ received: true });
});

// Verificar status Pro
app.get('/check-pro-status/:userId', (req, res) => {
  const isPro = proUsers.has(req.params.userId);
  res.json({ isPro });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
