; ---------------------------------------------------------------------------
;  Election Broadcast 2026 - instalador para o operador
;
;  Compilar no Windows com Inno Setup 6: https://jrsoftware.org/isinfo.php
;  1. Abra o script .iss no Inno Setup.
;  2. Build > Compile (Ctrl+F9).
;  3. Saida: artifacts\Instalar-ElectionBroadcast2026.exe
;
;  Antes de compilar, rode o pacote de entrega, que cria o runtime-stage:
;      node scripts\build-delivery.mjs
;
;  Decisoes importantes:
;   - PrivilegesRequired=lowest: instala em AppData do usuario, sem pedir
;     administracao. Um prompt de UAC numa maquina de transmissao e problema.
;   - O programa nao cria Atalho no menu Iniciar para o servidor rodar sozinho.
;     Ele precisa ser aberto com dois cliques, todos os dias, e em um modo
;     especifico. Iniciar junto com o Windows esconderia essa escolha.
; ---------------------------------------------------------------------------

#define AppName "Election Broadcast 2026"
#define AppVersion "1.0.0"
#define AppPublisher "Election Broadcast 2026"
#define AppExeName "ElectionBroadcast2026"

; O Inno Setup resolve caminho relativo a PARTIR DA PASTA DESTE ARQUIVO, que e
; scripts\. Por isso o "..\" nos dois lugares abaixo. Sem ele o instalador
; procuraria scripts\artifacts e nao acharia o runtime-stage.
#define StageDir "..\artifacts\runtime-stage\ElectionBroadcast2026"
#define OutputDir "..\artifacts"

[Setup]
AppId={{7F3C9A21-4E6B-4C0D-9E52-1B8A6D0F4C33}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={localappdata}\{#AppExeName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputDir={#OutputDir}
OutputBaseFilename=Instalar-{#AppExeName}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
; Sem privilegios de administrador: o instalador roda como o usuario logado.
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
; Windows 10 e 11 de 64 bits. Se faltar o 64-bit, o Node e o driver do banco
; que shaders tambem nao servem.
; "x64" e aceito em todas as versoes do Inno Setup 6. Ja "x64compatible"
; so existe a partir da 6.3, e trocar por ele quebraria quem tiver versao
; antiga instalada.
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
UninstallDisplayIcon={app}\runtime\node\node.exe
; O .exe e um .bat; o Windows precisaria mostrar o aviso do SmartScreen de
; qualquer jeito. Melhor um aviso nosso, curto e honesto.
WizardImageFile=
SetupLogging=yes
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "Criar atalho na Area de Trabalho"; \
    GroupDescription: "Atalhos:"; Flags: checkedonce

[Files]
; Todo o pacote validado por build-delivery.mjs: Node portatil, driver do banco
; para Windows, dist compilado, atalhos, scripts e documentacao.
Source: "{#StageDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

; Nao ha [UninstallDelete] de proposito. Depois de instalado, o programa cria
; .env (com a chave de acesso), CHAVE-DE-ACESSO.txt e a pasta data\ com o banco
; do TSE. Esses arquivos nascem depois da instalacao, entao o Inno Setup nao os
; remove, e isso e o que queremos: quem desinstalar por um problema passageiro
; nao perde a chave nem o cache ja baixado. Confirmado rodando o uninstaller:
; de 3814 arquivos sobram 17, todos de dados do operador.

[Icons]
Name: "{group}\Election Broadcast 2026"; Filename: "{app}\INICIAR.bat"; \
    WorkingDir: "{app}"; Comment: "Menu para escolher ENSAIO ou OFICIAL"
Name: "{group}\Manual do operador"; Filename: "{app}\MANUAL-OPERADOR.txt"
Name: "{group}\Desinstalar"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Election Broadcast 2026"; Filename: "{app}\INICIAR.bat"; \
    WorkingDir: "{app}"; Tasks: desktopicon

[Run]
; Roda a configuracao depois de instalar: testa o driver do banco, cria o .env
; com a chave de acesso, desliga a suspensao e mostra o endereco do painel.
; nowait: a janela do instalador fecha e o operador ve o resultado dela.
Filename: "{app}\INSTALAR.bat"; Description: "Configurar o programa agora"; \
    Flags: nowait postinstall skipifsilent

[Code]
// Se o .exe foi aberto de dentro de um ZIP ou de uma pasta sincronizada por
// nuvem, o avisa na hora. Nao da para corrigir sozinho, mas o aviso evita que
// o operador perca o banco no meio da transmissao.
function InitializeSetup(): Boolean;
begin
  Result := True;
  if GetWindowsVersion() < $0A then
  begin
    MsgBox('Este programa precisa do Windows 10 ou 11 de 64 bits.' + #13#10 +
           'A versao do Windows detectada e anterior.', mbError, MB_OK);
    Result := False;
  end;
end;

// Aviso de pasta na nuvem. Este e o gancho certo porque dispara quando o
// operador avanca da pagina de escolha de pasta, e devolver False o mantem
// na pagina.
//
// Nao usar CurStepChanged para isso: em Inno Setup 6.7 ele e "procedure
// CurStepChanged(CurStep: TSetupStep)", sem valor de retorno, entao nao da
// para impedir a instalacao dali. E InitializeSetup roda antes de existir
// pasta escolhida.
//
// Os parenteses em cada comparacao sao obrigatorios. No Pascal Script do
// Inno Setup o "or" tem precedencia MAIOR que a comparacao, ao contrario do
// Pascal padrao. Sem parenteses, "Pos(...) > 0 or Pos(...) > 0" e lido como
// "Pos(...) > (0 or Pos(...)) > 0", e o compilador acusa "Type mismatch" na
// ultima linha da expressao.
function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = wpSelectDir then
  begin
    if (Pos('onedrive', Lowercase(WizardDirValue)) > 0) or
       (Pos('dropbox', Lowercase(WizardDirValue)) > 0) or
       (Pos('google drive', Lowercase(WizardDirValue)) > 0) then
    begin
      if MsgBox('A pasta escolhida esta dentro de um servico de nuvem.' + #13#10#13#10 +
                'A sincronizacao corrompe o banco de dados durante a transmissao.' + #13#10#13#10 +
                'Quer continuar mesmo assim?', mbConfirmation, MB_YESNO) = IDNO then
      begin
        Result := False;
      end;
    end;
  end;
end;
