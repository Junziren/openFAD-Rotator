#ifndef Payload
  #error Payload is required
#endif

[Setup]
AppId={{29D0BC18-6158-48EF-A824-0F2B18D81915}
AppName=openFAD Rotator
AppVersion=0.1.0
AppPublisher=Unpure Bloom
DefaultDirName={autopf}\Unpure Bloom\openFAD Rotator
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
OutputDir={#Output}
OutputBaseFilename=openFAD-Rotator-0.1.0-Windows-x64-Offline-Setup
Compression=lzma2/fast
SolidCompression=no
WizardStyle=modern
SetupLogging=yes
CloseApplications=yes
RestartApplications=no
UninstallDisplayIcon={app}\openFAD Rotator.exe
LicenseFile={#Payload}\LICENSE

[Files]
Source: "{#Dependencies}\MicrosoftEdgeWebView2RuntimeInstallerX64.exe"; Flags: dontcopy
Source: "{#Dependencies}\VC_redist.current.x64.exe"; Flags: dontcopy
Source: "{#Payload}\Standalone\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#Payload}\VST3\openFAD Rotator.vst3\*"; DestDir: "{commoncf64}\VST3\openFAD Rotator.vst3"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#Payload}\THIRD_PARTY_LICENSES\*"; DestDir: "{app}\THIRD_PARTY_LICENSES"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#Payload}\LICENSE"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#Payload}\THIRD_PARTY_NOTICES.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{commonprograms}\openFAD Rotator"; Filename: "{app}\openFAD Rotator.exe"

[Run]
Filename: "{app}\openFAD Rotator.exe"; Description: "Open openFAD Rotator"; Flags: postinstall nowait skipifsilent unchecked runasoriginaluser

[Code]
var
  DependencyRestart: Boolean;

function WebViewPresent: Boolean;
var
  Version: String;
begin
  Result := RegQueryStringValue(HKLM32,
    'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
    'pv', Version) and (Version <> '') and (Version <> '0.0.0.0');
  if not Result then
    Result := RegQueryStringValue(HKLM64,
      'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
      'pv', Version) and (Version <> '') and (Version <> '0.0.0.0');
end;

function VCReady: Boolean;
var
  Installed, Major, Minor, Build: Cardinal;
  Key: String;
begin
  Key := 'SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64';
  Result := RegQueryDWordValue(HKLM64, Key, 'Installed', Installed) and (Installed = 1);
  if Result then begin
    Result := RegQueryDWordValue(HKLM64, Key, 'Major', Major) and
      RegQueryDWordValue(HKLM64, Key, 'Minor', Minor) and
      RegQueryDWordValue(HKLM64, Key, 'Bld', Build);
    Result := Result and ((Major > 14) or ((Major = 14) and
      ((Minor > 51) or ((Minor = 51) and (Build >= 36247)))));
  end;
end;

function InstallDependency(Name, Arguments: String): String;
var
  Code: Integer;
begin
  Result := '';
  Code := -1;
  Log('Installing bundled runtime: ' + Name);
  ExtractTemporaryFile(Name);
  if not Exec(ExpandConstant('{tmp}\') + Name, Arguments, '', SW_HIDE,
    ewWaitUntilTerminated, Code) then
    Result := 'Could not start bundled runtime installer: ' + Name
  else if (Code <> 0) and (Code <> 3010) and (Code <> 1638) then
    Result := 'Runtime installation failed: ' + Name + ' (exit ' + IntToStr(Code) + ')';
  if Code = 3010 then DependencyRestart := True;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if not VCReady then
    Result := InstallDependency('VC_redist.current.x64.exe', '/install /quiet /norestart')
  else Log('VC++ minimum version verified; keeping installed runtime.');
  if Result <> '' then Exit;
  if not VCReady then begin
    Result := 'Microsoft VC++ x64 runtime could not be verified. Setup has not installed the plugin.';
    Exit;
  end;
  if not WebViewPresent then
    Result := InstallDependency('MicrosoftEdgeWebView2RuntimeInstallerX64.exe', '/silent /install')
  else Log('Machine-wide WebView2 runtime verified; keeping installed runtime.');
  if Result <> '' then Exit;
  if not WebViewPresent then
    Result := 'Microsoft WebView2 runtime could not be verified. Setup has not installed the plugin.';
end;

function NeedRestart: Boolean;
begin
  Result := DependencyRestart;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    RegDeleteKeyIncludingSubkeys(HKLM64,
      'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\openFADRotator');
end;
