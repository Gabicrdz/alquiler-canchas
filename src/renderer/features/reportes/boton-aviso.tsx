// Botón "avisar por WhatsApp": le pide al main que abra WhatsApp con el mensaje
// ya escrito. La ventana nunca arma ni abre direcciones: solo dice a qué
// reserva y qué tipo de aviso (recordatorio o cobro).
import { MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { TipoDeAviso } from '@compartido/mensajes';
import { Button } from '@/components/ui/button';
import { desenvolver, canchas } from '@/lib/api';
import { useMutation } from '@tanstack/react-query';

interface Props {
  reservaId: number;
  tipo: TipoDeAviso;
  children: string;
  variant?: 'outline' | 'ghost';
  size?: 'default' | 'sm';
}

export function BotonAviso({ reservaId, tipo, children, variant = 'outline', size = 'default' }: Props) {
  const avisar = useMutation({
    mutationFn: () => desenvolver(canchas().whatsapp.avisar({ reservaId, tipo })),
    onSuccess: (r) => toast.success(`Se abrió WhatsApp con el mensaje para ${r.cliente}`, { description: 'Revisalo y tocá "Enviar" en WhatsApp.' }),
    onError: (e) => toast.error(e.message),
  });
  return (
    <Button variant={variant} size={size} disabled={avisar.isPending} onClick={() => avisar.mutate()}>
      <MessageCircle aria-hidden="true" /> {children}
    </Button>
  );
}
