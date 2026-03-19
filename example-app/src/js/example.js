import { Cast } from '@strasberry/capacitor-cast';

window.testEcho = () => {
    const inputValue = document.getElementById("echoInput").value;
    Cast.echo({ value: inputValue })
}
