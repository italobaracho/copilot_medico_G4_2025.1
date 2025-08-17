// src/components/Notification.tsx
import React, { useEffect, useState } from 'react';
import './Notification.css'; // Vamos criar este CSS logo abaixo

interface NotificationProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void; // Função para fechar a notificação
  duration?: number; // Tempo em ms para a notificação desaparecer (padrão: 3000ms)
}

const Notification: React.FC<NotificationProps> = ({
  message,
  type = 'success',
  onClose,
  duration = 3000,
}) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Configura um timer para fechar a notificação automaticamente
    const timer = setTimeout(() => {
      setIsVisible(false); // Inicia a animação de fade-out
      // Espera a animação terminar antes de remover o componente
      const removeTimer = setTimeout(onClose, 500); // 500ms é a duração do fade-out
      return () => clearTimeout(removeTimer);
    }, duration);

    // Limpa o timer se o componente for desmontado antes
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  // Se não estiver visível, não renderiza nada
  if (!isVisible) {
    return null;
  }

  return (
    <div className={`notification-container notification-${type} ${isVisible ? 'show' : 'hide'}`}>
      <div className="notification-content">
        {/* Ícone de sucesso (você pode substituir por um SVG ou Font Awesome) */}
        {type === 'success' && (
          <svg className="notification-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.535-2.13-1.932a.75.75 0 1 0-1.094 1.06l3.75 3.404 4.5-6.307Z" clipRule="evenodd" />
          </svg>
        )}
        <p className="notification-message">{message}</p>
        <button className="notification-close-btn" onClick={() => setIsVisible(false)}>
          &times; {/* Símbolo de 'x' para fechar */}
        </button>
      </div>
    </div>
  );
};

export default Notification;