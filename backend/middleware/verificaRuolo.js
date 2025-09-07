export default function verificaRuolo(ruoloRichiesto) {
    return (req, res, next) => {
      if (req.user?.ruolo !== ruoloRichiesto) {
        return res.status(403).json({ error: 'Accesso negato: ruolo insufficiente' });
      }
      next();
    };
  }
  