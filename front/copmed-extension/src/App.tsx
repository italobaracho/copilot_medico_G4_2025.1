import { useState, useEffect, useCallback, Key, ReactNode } from 'react';
import './App.css';
import Chat from './modules/Chat/chat';
import { executeScriptOnActiveTab } from './utils/utils';
const SERVER_URL = 'http://localhost:3001';

// --- Tipos ---
type Message = {
  id: Key;
  text: ReactNode;
  sender: 'user' | 'bot';
  timestamp: string;
};

type PatientListItem = {
    id: string;
    name: string;
};

type ConsultationListItem = {
    id: string;
    title: string;
    date: string;
};

// --- Componente Principal App ---
function App() {
  // --- Estados do Aplicativo ---
  const [currentPatientId, setCurrentPatientId] = useState<string | null>(null);
  const [currentConsultationId, setCurrentConsultationId] = useState<string | null>(null);

  // Estados para Debug
  const [debugSelector, setDebugSelector] = useState('.note-editable[role="textbox"]');
  const [debugIndex, setDebugIndex] = useState(0);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState(false);

  // Estados do Chat e Carregamento
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1, // ID inicial para a mensagem de boas-vindas padrão
      text: "Olá! Sou o assistente virtual Copilot. Como posso ajudar?",
      sender: "bot",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    },
  ]);

  // Estados para Pacientes e Consultas
  const [availablePatients, setAvailablePatients] = useState<PatientListItem[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [newPatientName, setNewPatientName] = useState<string>(''); // Nome para o novo paciente

  const [availableConsultations, setAvailableConsultations] = useState<ConsultationListItem[]>([]);
  const [selectedConsultationId, setSelectedConsultationId] = useState<string>('');

  // --- Funções Auxiliares ---
  const generateId = (): Key => Date.now() + Math.random();

  // --- Funções de Comunicação com Backend ---

  // Verifica a existência de um Patient ID
  const checkPatientIdExistence = useCallback(async (patientId: string) => {
    if (!patientId) {
        console.warn("checkPatientIdExistence: patientId está vazio ou nulo. Iniciando nova sessão.");
        return false;
    }

    console.log('[FRONTEND] Verificando existência para patientId:', patientId); // <-- MUITO IMPORTANTE
    try {
        const response = await fetch(`${SERVER_URL}/api/patient-exists/${patientId}`);
        if (!response.ok) {
            // Se a resposta não for OK (ex: 404, 500), joga um erro
            const errorText = await response.text();
            throw new Error(`Erro HTTP ${response.status}: ${errorText}`);
        }
        const data = await response.json();
        console.log('[FRONTEND] Resposta do backend para', patientId, ':', data); // <-- MUITO IMPORTANTE

        if (data.status === 'success' && data.exists) {
            console.log('[FRONTEND] Paciente encontrado no backend:', patientId);
            return true;
        } else {
            console.log('[FRONTEND] Paciente NÃO encontrado no backend ou status não é sucesso:', patientId);
            return false;
        }
    } catch (error) {
        console.error('[FRONTEND] Erro ao verificar existência do Patient ID:', error);
        return false;
    }
}, []);

  // Carrega o histórico de uma consulta específica
  const loadConsultationHistory = useCallback(async (patientId: string, consultationId: string) => {
    try {
        const response = await fetch(`http://localhost:3001/api/patients/${patientId}/consultations/${consultationId}/history`);
        const data = await response.json();
        if (response.ok && data.history) {
            const loadedMessages: Message[] = data.history.map((msg: any) => ({
                id: generateId(),
                text: msg.parts[0]?.text || "",
                sender: msg.role,
                // Correção: toLocaleTimeString ao invés de toLocaletoLocaleTimeString
                timestamp: new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }));

            const infoMsg: Message = {
                id: generateId(),
                text: `Histórico da consulta ${consultationId.substring(0, 8)}... carregado.`,
                sender: "bot",
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            setMessages([infoMsg, ...loadedMessages]); // Substitui mensagens atuais

        } else {
            console.error(`Erro ao carregar histórico da consulta: ${data.message || 'Resposta inesperada'}`);
            const errorMsg: Message = { id: generateId(), text: "Não foi possível carregar o histórico da consulta.", sender: 'bot', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
            setMessages(prev => [...prev, errorMsg]);
        }
    } catch (error) {
        console.error('Erro de rede ao carregar histórico da consulta:', error);
        const networkErrorText = error instanceof Error ? error.message : "Verifique a conexão e o backend.";
        const errorMsg: Message = { id: generateId(), text: `Erro de conexão ao carregar histórico da consulta: ${networkErrorText}`, sender: 'bot', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
        setMessages(prev => [...prev, errorMsg]);
    }
  }, []);

  // Carrega a lista de consultas para um paciente específico
  const fetchPatientConsultations = useCallback(async (patientId: string) => {
    try {
        const response = await fetch(`http://localhost:3001/api/patients/${patientId}/consultations`);
        const data = await response.json();
        if (response.ok && data.consultations) {
            setAvailableConsultations(data.consultations);
            // Se houver consultas e nenhuma estiver selecionada, selecione a primeira
            if (data.consultations.length > 0) {
                // Prioriza a consulta atual se ela existir na lista, senão seleciona a primeira
                const defaultConsultation = data.consultations.find((c: ConsultationListItem) => c.id === currentConsultationId) || data.consultations[0];
                setCurrentConsultationId(defaultConsultation.id);
                setSelectedConsultationId(defaultConsultation.id);
                loadConsultationHistory(patientId, defaultConsultation.id);
            } else {
                // Se não houver consultas, pode-se automaticamente criar uma aqui ou esperar o usuário
                setCurrentConsultationId(null);
                setSelectedConsultationId('');
                setMessages([
                    {
                        id: generateId(),
                        text: "Nenhuma consulta encontrada para este paciente. Crie uma nova para começar.",
                        sender: "bot",
                        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    }
                ]);
            }
        } else {
            console.error('Erro ao carregar consultas do paciente:', data.message || 'Resposta inesperada');
            setAvailableConsultations([]);
            setCurrentConsultationId(null);
            setSelectedConsultationId('');
        }
    } catch (error) {
        console.error('Erro de rede ao carregar consultas do paciente:', error);
        setAvailableConsultations([]);
        setCurrentConsultationId(null);
        setSelectedConsultationId('');
    }
  }, [currentConsultationId, loadConsultationHistory]);

  // Carrega a lista de todos os pacientes disponíveis
  const fetchAllPatients = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:3001/api/all-patients');
      const data = await response.json();
      if (response.ok && data.patients) {
        setAvailablePatients(data.patients);
      } else {
        console.error('Erro ao carregar lista de pacientes:', data.message || 'Resposta inesperada');
      }
    } catch (error) {
      console.error('Erro de rede ao carregar lista de pacientes:', error);
    }
  }, []);

  // --- Efeitos de Montagem e Sincronização ---

  // Carrega dados da sessão (patientId) e a lista de pacientes/consultas ao iniciar a extensão
  useEffect(() => {
    chrome.storage.local.get(['copilotMedicoPatientId', 'copilotMedicoConsultationId'], async (result) => {
      const savedPatientId = result.copilotMedicoPatientId;
      const savedConsultationId = result.copilotMedicoConsultationId;

      if (savedPatientId) {
        const idExists = await checkPatientIdExistence(savedPatientId);
        if (idExists) {
          setCurrentPatientId(savedPatientId);
          setSelectedPatientId(savedPatientId);
          // Tenta carregar as consultas e, se houver uma consulta salva, prioriza-a
          if (savedConsultationId) {
            setCurrentConsultationId(savedConsultationId);
            setSelectedConsultationId(savedConsultationId);
          }
          await fetchPatientConsultations(savedPatientId); // Isso também carregará o histórico
        } else {
          console.warn("ID de paciente salvo não encontrado no backend. Iniciando nova sessão.");
          handleNewPatientSession();
        }
      }
      fetchAllPatients(); // Sempre carrega a lista de pacientes disponíveis
    });
  }, [checkPatientIdExistence, fetchAllPatients, fetchPatientConsultations]);


  // --- Funções de Manipulação da UI e Lógica de Negócio ---

  // Reinicia a sessão (limpa paciente, consulta e chat)
  const handleNewPatientSession = () => {
    setCurrentPatientId(null);
    setCurrentConsultationId(null);
    setSelectedPatientId('');
    setSelectedConsultationId('');
    setNewPatientName('');
    chrome.storage.local.remove(['copilotMedicoPatientId', 'copilotMedicoConsultationId']);
    setMessages([
      {
        id: generateId(),
        text: "Nova sessão iniciada. Selecione ou crie um paciente para começar.",
        sender: "bot",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setAvailableConsultations([]); // Limpa consultas na UI
    fetchAllPatients(); // Recarrega pacientes (caso um novo tenha sido criado e o dropdown precise ser atualizado)
  };

  // Lida com a seleção de paciente no dropdown
const handlePatientSelectChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
  const newPatientId = event.target.value;
  console.log('Tentando selecionar Patient ID:', newPatientId); // Adicione este log
  setSelectedPatientId(newPatientId);
  console.log('selectedPatientId após setState:', newPatientId); // Adicione este log

  if (newPatientId === '') {
      console.log('Nova sessão de paciente solicitada.'); // Adicione este log
      handleNewPatientSession();
  } else {
      setCurrentPatientId(newPatientId);
      console.log('Salvando copilotMedicoPatientId no storage local:', newPatientId); // Adicione este log
      chrome.storage.local.set({ copilotMedicoPatientId: newPatientId });
      setCurrentConsultationId(null);
      setSelectedConsultationId('');
      console.log('Buscando consultas para:', newPatientId); // Adicione este log
      await fetchPatientConsultations(newPatientId);
      console.log('fetchPatientConsultations concluído.'); // Adicione este log
  }
};

  // Lida com a criação de um novo paciente
  const handleCreateNewPatient = async () => {
    if (newPatientName.trim() === '') {
        alert('Por favor, insira um nome para o novo paciente.');
        return;
    }

    setIsLoading(true);
    try {
        const response = await fetch('http://localhost:3001/api/patients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newPatientName.trim() })
        });
        const data = await response.json();

        if (response.ok && data.patient_id) {
            const newId = data.patient_id;
            const newName = data.patient_name || newPatientName.trim();
            const firstConsultationId = data.first_consultation_id;

            setCurrentPatientId(newId);
            setSelectedPatientId(newId);
            setCurrentConsultationId(firstConsultationId);
            setSelectedConsultationId(firstConsultationId);

            chrome.storage.local.set({ 
                copilotMedicoPatientId: newId,
                copilotMedicoConsultationId: firstConsultationId
            });

            setMessages([
              {
                id: generateId(),
                text: `Bem-vindo(a), ${newName}! Uma nova sessão de consulta foi iniciada para você. Como posso ajudar?`,
                sender: "bot",
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              }
            ]);
            setNewPatientName('');
            fetchAllPatients(); // Recarrega a lista para incluir o novo paciente
            fetchPatientConsultations(newId); // Carrega a primeira consulta
        } else {
            console.error('Erro ao criar novo paciente:', data.message || 'Resposta inesperada.');
            alert(`Erro ao criar novo paciente: ${data.message || 'Verifique o servidor.'}`);
        }
    } catch (error) {
        console.error('Erro de rede ao criar novo paciente:', error);
        alert('Erro de conexão ao criar novo paciente. Verifique se o backend está rodando.');
    } finally {
        setIsLoading(false);
    }
  };

  // Lida com a seleção de consulta no dropdown
  const handleConsultationSelectChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newConsultationId = event.target.value;
    setSelectedConsultationId(newConsultationId);

    if (newConsultationId === '' || !currentPatientId) {
        setMessages([
          {
            id: generateId(),
            text: "Selecione uma consulta ou crie uma nova.",
            sender: "bot",
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
        setCurrentConsultationId(null);
        chrome.storage.local.remove('copilotMedicoConsultationId');
    } else {
        setCurrentConsultationId(newConsultationId);
        chrome.storage.local.set({ copilotMedicoConsultationId: newConsultationId });
        await loadConsultationHistory(currentPatientId, newConsultationId);
    }
  };

  // Lida com a criação de uma nova consulta
  const handleCreateNewConsultation = async () => {
    if (!currentPatientId) {
        alert("Por favor, selecione ou crie um paciente antes de criar uma nova consulta.");
        return;
    }

    setIsLoading(true);
    try {
        const response = await fetch(`http://localhost:3001/api/patients/${currentPatientId}/consultations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: `Nova Consulta em ${new Date().toLocaleDateString()}` }) // Título padrão
        });
        const data = await response.json();

        if (response.ok && data.consultation_id) {
            const newConsultationId = data.consultation_id;
            setCurrentConsultationId(newConsultationId);
            setSelectedConsultationId(newConsultationId);
            chrome.storage.local.set({ copilotMedicoConsultationId: newConsultationId });

            setMessages([
              {
                id: generateId(),
                text: `Nova consulta "${data.consultation_title}" iniciada para o paciente.`,
                sender: "bot",
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              }
            ]);
            // Recarrega a lista de consultas para atualizar o dropdown
            await fetchPatientConsultations(currentPatientId);
        } else {
            console.error('Erro ao criar nova consulta:', data.message || 'Resposta inesperada.');
            alert(`Erro ao criar nova consulta: ${data.message || 'Verifique o servidor.'}`);
        }
    } catch (error) {
        console.error('Erro de rede ao criar nova consulta:', error);
        alert('Erro de conexão ao criar nova consulta. Verifique se o backend está rodando.');
    } finally {
        setIsLoading(false);
    }
  };


  // --- Funções de Extração de Dados da Página ---
  const [editableNotes] = useState(
    {
      selector: '.note-editable[role="textbox"]',
      roleAndIndex: [
        { role: 'Anamnese', index: 0 },
        { role: 'Detalhes exame físico', index: 1 },
        { role: 'Conclusão diagnóstica', index: 2 },
        { role: 'lista de problemas', index: 3 }
      ]
    }
  );

  const createInputs = async () => {
    const inputKeys = ["peso", "altura", "imc", "tempe", "freqres", "freqcar", "pas", "pad"]
    let inputs = []
    for (let inputKey of inputKeys) {
      inputs.push({ input: `input[f_prontuario="${inputKey}"]`, role: inputKey });
    }
    return inputs
  }

  const extractDinamicData = async () => {
    let extractedData = [];
    let inputs = await createInputs();
    for (let i = 0; i < inputs.length; i++) {
      const { input, role } = inputs[i];
      const result = await extractSingleDiv(input, 0); // Presume que inputs dinâmicos têm index 0
      if (result) {
        extractedData.push({ role, text: result });
      }
    }
    return extractedData;
  }

  const extractEditableNotesData = async () => {
    let extractedData = [];
    for (let i = 0; i < editableNotes.roleAndIndex.length; i++) {
      const { role, index } = editableNotes.roleAndIndex[i];
      const result = await extractSingleDiv(editableNotes.selector, index);
      if (result) {
        extractedData.push({ role, text: result });
      }
    }
    return extractedData;
  }

  const extractSingleDivDebug = async (selector: string, index: number) => { // Tipagem corrigida
    try {
      const result = await executeScriptOnActiveTab(selector, index);
      if (result) {
        setExtractedText(result);
        console.log('Texto extraído (Debug):', result);
      } else {
        console.log('Não foi possível extrair o texto (Debug)');
        setExtractedText(null); // Limpa se não extraiu nada
      }
    } catch (error) {
      console.error('Erro ao executar o script (Debug):', error);
      setExtractedText(`Erro: ${error instanceof Error ? error.message : String(error)}`); // Exibe erro
    }
  };

  // CORREÇÃO AQUI: Tipagem para selector e index, e retorno consistente
  const extractSingleDiv = async (selector: string, index: number): Promise<string | null> => {
    try {
      const result = await executeScriptOnActiveTab(selector, index);
      return result || null;
    } catch (error) {
      console.error('Erro em extractSingleDiv:', error);
      return null;
    }
  };

  const sendExtractedDataToServer = async (extractedData: any) => {
    if (!currentPatientId || !currentConsultationId) {
        alert("Por favor, selecione um paciente e uma consulta antes de extrair dados.");
        return null;
    }
    try {
      const payload = {
        extracted_content: extractedData,
        patient_id: currentPatientId,
        consultation_id: currentConsultationId // Inclui o ID da consulta
      };

      const response = await fetch('http://localhost:3001/api/extracted-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        console.log('Dados extraídos enviados com sucesso para /api/extracted-data');
        const dados = await response.json();
        return dados;
      } else {
        console.log(`Erro ${response.status} ao enviar dados extraídos para /api/extracted-data`);
        return null;
      }
    } catch (error) {
      console.error('Erro de rede ao enviar dados extraídos:', error);
      return null;
    }
  }

  const handleExtractData = async () => {
    console.log("Botão 'Extrair Dados da Página' clicado.");
    if (!currentPatientId || !currentConsultationId) {
        alert("Por favor, selecione um paciente e uma consulta para extrair dados.");
        return;
    }
    setIsLoading(true);
    try {
      const [staticData, dinamicData] = await Promise.all([
        extractEditableNotesData(),
        extractDinamicData()
      ]);
      const combinedData = [...staticData, ...dinamicData];
      console.log("Dados combinados para enviar:", combinedData);

      if (combinedData.length > 0) {
        const dados = await sendExtractedDataToServer(combinedData);
        console.log('Resposta do servidor para dados extraídos:', dados);

        if (dados && dados.ai_response) {
            const botResponse: Message = {
                id: generateId(),
                text: dados.ai_response,
                sender: "bot",
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            setMessages(prevMessages => [...prevMessages, botResponse]);
        } else if (dados) {
            console.warn("Servidor respondeu para /extracted-data, mas sem ai_response.");
            const infoMsg: Message = { id: generateId(), text: "Dados da página enviados, mas não houve resposta da IA para exibir.", sender: 'bot', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
            setMessages(prev => [...prev, infoMsg]);
        } else {
            const errorMsg: Message = { id: generateId(), text: "Falha ao enviar ou processar os dados extraídos da página.", sender: 'bot', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
            setMessages(prev => [...prev, errorMsg]);
        }
      } else {
          console.log("Nenhum dado extraído da página para enviar.");
          const infoMsg: Message = { id: generateId(), text: "Não encontrei dados para extrair nesta página.", sender: 'bot', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
          setMessages(prev => [...prev, infoMsg]);
      }
    } catch (error) {
      console.error('Erro no processo de extração de dados:', error);
      const errorMsg: Message = { id: generateId(), text: "Ocorreu um erro durante a extração de dados.", sender: 'bot', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
        setIsLoading(false);
    }
  };

  const handleDebugMode = () => {
    setDebugMode(!debugMode);
  }

  // --- Funções de Envio de Mensagens e Upload de PDF ---

  const handleSendMessage = useCallback(async (userMessageText: string) => {
    if (!userMessageText.trim() || isLoading) return;
    // O chat só funciona se houver um paciente E uma consulta selecionada
    if (!currentPatientId || !currentConsultationId) {
      alert("Por favor, selecione um paciente e uma consulta para iniciar a conversa.");
      return;
    }

    const userUIMessage: Message = {
      id: generateId(),
      text: userMessageText,
      sender: "user" as const,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages(prevMessages => [...prevMessages, userUIMessage]);

    setIsLoading(true);
    try {
      const payload: { message: string; patient_id: string; consultation_id: string } = {
        message: userMessageText,
        patient_id: currentPatientId,
        consultation_id: currentConsultationId
      };

      const response = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok) {
        if (data.ai_response) {
          const botMessage: Message = {
            id: generateId(),
            text: data.ai_response,
            sender: "bot",
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
          setMessages(prevMessages => [...prevMessages, botMessage]);
        } else if (!data.ai_response && data.message) {
          const infoMsg: Message = { id: generateId(), text: data.message, sender: 'bot', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
          setMessages(prevMessages => [...prevMessages, infoMsg]);
        } else {
          console.error("Resposta do /api/chat OK, mas sem ai_response ou message:", data);
          const errMsg: Message = { id: generateId(), text: "Recebi uma resposta inesperada do servidor.", sender: 'bot', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
          setMessages(prevMessages => [...prevMessages, errMsg]);
        }
      } else {
        const errorText = data.message || `Desculpe, ocorreu um erro no servidor (${response.status}).`;
        console.error(`Erro do backend (${response.status}) ao processar /api/chat:`, errorText);
        const errMsg: Message = { id: generateId(), text: errorText, sender: 'bot', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
        setMessages(prevMessages => [...prevMessages, errMsg]);
      }
    } catch (error) {
      console.error('Erro de rede ao enviar mensagem para /api/chat:', error);
      const networkErrorText = error instanceof Error ? error.message : "Verifique a conexão e o backend.";
      const errMsg: Message = { id: generateId(), text: `Erro de conexão: ${networkErrorText}`, sender: 'bot', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
      setMessages(prevMessages => [...prevMessages, errMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, currentPatientId, currentConsultationId]);


  const handleUploadPdf = async (file: File) => {
    if (!file) return;
    if (!currentPatientId || !currentConsultationId) {
        alert("Por favor, selecione um paciente e uma consulta antes de fazer upload de um PDF.");
        return;
    }

    setIsLoading(true);

    const processingUserMessage: Message = {
      id: generateId(),
      text: `Enviando e processando o arquivo: ${file.name}...`,
      sender: "user",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages(prevMessages => [...prevMessages, processingUserMessage]);

    const formData = new FormData();
    formData.append('pdf', file);
    formData.append('patient_id', currentPatientId);
    formData.append('consultation_id', currentConsultationId); // Inclui o ID da consulta

    try {
      const response = await fetch('http://localhost:3001/api/upload-pdf', {
        method: 'POST',
        body: formData
      });

      setIsLoading(false);
      const data = await response.json();

      if (response.ok) {
        // A lógica de setar patient_id e consultation_id no client agora é controlada pelos dropdowns/criação
        if (data.ai_response) {
          const botMessage: Message = {
            id: generateId(),
            text: data.ai_response,
            sender: "bot",
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
          setMessages(prevMessages => [...prevMessages, botMessage]);
        } else if (!data.ai_response && data.message) {
            const infoMsg: Message = { id: generateId(), text: data.message, sender: 'bot', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
            setMessages(prevMessages => [...prevMessages, infoMsg]);
        }
      } else {
        const errorText = data.message || `Erro ao processar PDF (${response.status}).`;
        const errorMessage: Message = {
          id: generateId(),
          text: errorText,
          sender: "bot",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages(prevMessages => [...prevMessages, errorMessage]);
      }
    } catch (error) {
      console.error('Erro de rede ao enviar PDF:', error);
      setIsLoading(false);

      const networkErrorText = error instanceof Error ? error.message : "Verifique a conexão e o backend.";
      const errorMessage: Message = {
        id: generateId(),
        text: `Falha no upload do PDF: ${networkErrorText}`,
        sender: "bot",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prevMessages => [...prevMessages, errorMessage]);
    }
  };

  // --- Renderização da UI ---
  return (
    <>
      <div className="top-bar">
        {/* Input e Botão para Criar Novo Paciente */}
        <input
          type="text"
          placeholder="Nome do Novo Paciente"
          value={newPatientName}
          onChange={(e) => setNewPatientName(e.target.value)}
          className="new-patient-input"
          disabled={isLoading}
        />
        <button
          onClick={handleCreateNewPatient}
          disabled={isLoading || newPatientName.trim() === ''}
          className="create-patient-button"
        >
          Criar Novo Paciente
        </button>
      </div>

      <div className="selection-bar">
        {/* Dropdown de Seleção de Paciente */}
        <label htmlFor="patient-select">Paciente:</label>
        <select
          id="patient-select"
          className="patient-select"
          value={selectedPatientId}
          onChange={handlePatientSelectChange}
          disabled={isLoading}
        >
          <option value="">-- Selecionar Paciente --</option>
          {availablePatients.map((patient) => (
            <option key={patient.id} value={patient.id}>
              {patient.name}
            </option>
          ))}
        </select>

        {/* Dropdown de Seleção de Consulta */}
        <label htmlFor="consultation-select">Consulta:</label>
        <select
          id="consultation-select"
          className="consultation-select"
          value={selectedConsultationId}
          onChange={handleConsultationSelectChange}
          // Desabilita se não houver paciente selecionado ou consultas disponíveis
          disabled={isLoading || !currentPatientId || availableConsultations.length === 0}
        >
          <option value="">-- Selecionar Consulta --</option>
          {availableConsultations.map((consultation) => (
            <option key={consultation.id} value={consultation.id}>
              {consultation.title} ({new Date(consultation.date).toLocaleDateString()})
            </option>
          ))}
        </select>
        
        {/* Botão para criar nova consulta */}
        {currentPatientId && (
            <button
                className="create-consultation-button"
                onClick={handleCreateNewConsultation}
                disabled={isLoading}
            >
                Nova Consulta
            </button>
        )}
      </div>

      {/* Componente de Chat */}
      <Chat
        messages={messages}
        onSendMessage={handleSendMessage}
        isLoading={isLoading}
        onUploadPdf={handleUploadPdf}
      />

      {/* Seção de Ferramentas e Debug */}
      <div className="card">
        <button onClick={handleNewPatientSession}>Limpar Sessão Atual</button>
        <button onClick={handleDebugMode}>Debug</button>
        {
          debugMode && (
            <div>
              <div>
                <label> Seletor CSS: <input type="text" value={debugSelector} onChange={(e) => setDebugSelector(e.target.value)} placeholder="Exemplo: .note-editable[role='textbox']" /> </label>
              </div>
              <div>
                <label> Índice: <input type="number" value={debugIndex} onChange={(e) => setDebugIndex(parseInt(e.target.value, 10))} min={0} /> </label>
              </div>
              <div> {extractedText && <p>Texto extraído (Debug): {extractedText}</p>} </div>
              <button onClick={() => extractSingleDivDebug(debugSelector, debugIndex)}>Extrair texto (Debug)</button>
            </div>
          )
        }
        <button onClick={handleExtractData} disabled={!currentPatientId || !currentConsultationId || isLoading}> Extrair Dados da Página </button>
      </div>
    </>
  );
}

export default App;