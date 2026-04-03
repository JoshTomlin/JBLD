import React from 'react';
import ReactDOM from 'react-dom';
import 'bootstrap/dist/css/bootstrap.css'
import 'bootstrap/dist/css/bootstrap.min.css';
import "./App.css"
import App from './App'
import * as serviceWorkerRegistration from "./serviceWorkerRegistration";
ReactDOM.render(<App />, document.getElementById('root'));
serviceWorkerRegistration.register();
