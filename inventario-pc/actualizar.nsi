; Actualizador del Inventario Araucana de Gases a la versión 1.2.0 (conectada a AS SYSTEMS).
; Conserva el programa anterior como resources\anterior.asar y pone el nuevo resources\app.asar.
Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"

!define VERSION "1.2.0"
!define EXE "Inventario Araucana de Gases.exe"
Name "Inventario Araucana de Gases ${VERSION}"
OutFile "..\dist-inv\Actualizar_Inventario_Araucana_${VERSION}.exe"
RequestExecutionLevel user
InstallDir "$LOCALAPPDATA\Programs\Inventario Araucana"
BrandingText "AS SYSTEMS"
ShowInstDetails show

Function .onInit
  ; Si el programa no está en la carpeta normal, la busca en el registro
  ${IfNot} ${FileExists} "$INSTDIR\${EXE}"
    ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\InventarioAraucana" "InstallLocation"
    ${If} $0 == ""
      ReadRegStr $0 HKCU "Software\InventarioAraucana" "InstallDir"
    ${EndIf}
    ${If} $0 == ""
      ReadRegStr $0 HKCU "Software\InventarioAraucana" ""
    ${EndIf}
    ${If} ${FileExists} "$0\${EXE}"
      StrCpy $INSTDIR $0
    ${EndIf}
  ${EndIf}
FunctionEnd

Function VerificarCarpeta
  ${IfNot} ${FileExists} "$INSTDIR\${EXE}"
    MessageBox MB_ICONEXCLAMATION "En esta carpeta no está instalado el Inventario Araucana de Gases.$\r$\n$\r$\nElija la carpeta correcta o instale primero la versión 1.0.0 (Instalar_Inventario_Araucana_1_0_0.exe)."
    Abort
  ${EndIf}
FunctionEnd

!define MUI_WELCOMEPAGE_TITLE "Actualizar el Inventario a la versión ${VERSION}"
!define MUI_WELCOMEPAGE_TEXT "Desde esta versión el inventario queda en la nube de AS SYSTEMS: todos los computadores, la web y los celulares ven la misma información al instante.$\r$\n$\r$\nAl abrirlo se pedirá el código de licencia que entrega el administrador de AS SYSTEMS y luego el usuario y contraseña de AS SYSTEMS.$\r$\n$\r$\nEl inventario que hay en este computador NO se borra: queda en Archivo → Inventario anterior, para consultarlo o exportarlo a Excel.$\r$\n$\r$\nCierre el Inventario antes de continuar."
!insertmacro MUI_PAGE_WELCOME
!define MUI_DIRECTORYPAGE_TEXT_TOP "Carpeta donde está instalado el Inventario. Normalmente no hay que cambiarla."
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE VerificarCarpeta
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_TITLE "Inventario actualizado"
!define MUI_FINISHPAGE_TEXT "El Inventario quedó en la versión ${VERSION}, conectado a AS SYSTEMS.$\r$\n$\r$\nRepita esta actualización en los demás computadores que usan el inventario."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir el Inventario ahora"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "Spanish"

Section "Actualizar"
  DetailPrint "Cerrando el Inventario si está abierto…"
  nsExec::Exec 'taskkill /F /IM "${EXE}"'
  Pop $0
  Sleep 1500
  SetOutPath "$INSTDIR\resources"
  ; Guarda el programa anterior una sola vez (si se repite la actualización no lo pisa)
  ${IfNot} ${FileExists} "$INSTDIR\resources\anterior.asar"
    ClearErrors
    Rename "$INSTDIR\resources\app.asar" "$INSTDIR\resources\anterior.asar"
    ${If} ${Errors}
      MessageBox MB_ICONSTOP "No se pudo actualizar porque el Inventario sigue abierto. Ciérrelo (y reinicie el computador si hace falta) y vuelva a ejecutar esta actualización."
      Abort
    ${EndIf}
  ${EndIf}
  ClearErrors
  SetOverwrite on
  File "/oname=app.asar" "..\dist-inv\app.asar"
  ${If} ${Errors}
    MessageBox MB_ICONSTOP "No se pudo copiar el programa nuevo. Cierre el Inventario y vuelva a ejecutar esta actualización."
    Abort
  ${EndIf}
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\InventarioAraucana" "DisplayVersion" "${VERSION}"
  DetailPrint "Inventario actualizado a la versión ${VERSION}."
SectionEnd
