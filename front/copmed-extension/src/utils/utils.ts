// src/utils/utils.ts

/**
 * Função para extrair o conteúdo de um elemento com base no seletor CSS e índice.
 * Suporta inputs (text, textarea, select) e elementos com conteúdo de texto.
 * @param selector O seletor CSS do elemento.
 * @param index O índice do elemento (se houver múltiplos elementos com o mesmo seletor). Padrão é 0.
 * @returns O texto ou valor do elemento, ou null se não for encontrado.
 */
export const extractTextFromElement = (selector: string, index: number = 0): string | null => {
    const elements = document.querySelectorAll(selector);

    if (elements && elements.length > index) {
        const element = elements[index];
        
        // Se for um input (ou textarea, select), retorna o valor
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
            return element.value || null; 
        }

        // Se for um elemento HTML genérico, retorna o conteúdo textual
        if (element instanceof HTMLElement) {
            return element.textContent?.trim() ?? null; 
        }
    }
    
    return null; // Caso nenhum elemento seja encontrado ou o valor esteja ausente
};
 
/**
 * Função assíncrona para executar o script 'extractTextFromElement' na aba ativa.
 * Esta função é específica para extrair um único pedaço de texto de um elemento.
 * @param selector O seletor CSS do elemento alvo.
 * @param index O índice do elemento (se houver múltiplos elementos). Padrão é 0.
 * @returns Uma Promise que resolve com o texto extraído ou null.
 */
export const executeScriptOnActiveTab = async (selector: string, index: number = 0): Promise<string | null> => {
    return new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tabId = tabs[0]?.id;

            if (tabId !== undefined) {
                chrome.scripting.executeScript(
                    {
                        target: { tabId: tabId },
                        function: extractTextFromElement,
                        args: [selector, index],      
                    } as unknown as chrome.scripting.ScriptInjection<any[], unknown>, // Type assertion mantido
                    (injectionResults) => {
                        // Verifica se há resultados e se o resultado não é indefinido ou null
                        // Converte explicitamente para string ou null para corresponder ao tipo de Promise.
                        const result = injectionResults?.[0]?.result;
                        if (typeof result === 'string') {
                            resolve(result);
                        } else {
                            resolve(null); // Resolve com null se não for string (incluindo {}, undefined, null)
                        }
                    }
                );
            } else {
                reject('Nenhuma aba ativa encontrada ou ID de aba indefinido.');
            }
        });
    });
};

/**
 * Função genérica para executar qualquer script assíncrono na aba ativa
 * e retornar seu resultado.
 * Esta função é flexível e permite passar qualquer função de callback
 * e um número variável de argumentos para essa função.
 * @param func A função a ser executada no contexto da página (será serializada e injetada).
 * @param args Argumentos a serem passados para a função 'func'.
 * @returns Uma Promise que resolve com o resultado da função 'func' ou undefined em caso de erro.
 */
export async function executeArbitraryScriptOnActiveTab<T, Args extends any[]>(
    func: (...args: Args) => T, 
    ...args: Args 
): Promise<T | undefined> {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || tab.id === undefined) {
            console.error("Nenhuma aba ativa encontrada ou ID de aba indefinido.");
            return undefined;
        }

        const injectionResults = await chrome.scripting.executeScript(
            {
                target: { tabId: tab.id },
                function: func, 
                args: args,    
            } as unknown as chrome.scripting.ScriptInjection<Args, T>, // Type assertion mantido
        );

        // Verifica se há resultados e se o resultado não é indefinido
        // Faz um cast explícito para T ou undefined.
        const result = injectionResults?.[0]?.result;
        if (result !== undefined) {
            return result as T; // O TypeScript infere que T pode ser {} aqui se a função injetada retornar {}
        } else {
            return undefined;
        }

    } catch (error) {
        console.error("Erro ao executar script na aba ativa:", error);
        return undefined;
    }
}