import { FormEvent, useEffect, useRef, useState } from "react";

import { Navigate } from "react-router-dom";

import gsap from "gsap";

import loginBg from "../../../assets/login_image.jpg";

import { useAuth } from "../context/AuthProvider";



const BRAND_NAME =

  (import.meta.env.VITE_RESTAURANT_NAME as string | undefined)?.trim() || "POS Restaurante";



const TAGLINE = "Gestión de sala y cocina en un solo lugar.";



const loginPanelBgStyle = {

  backgroundImage: `url(${loginBg})`,

  backgroundSize: "cover",

  backgroundPosition: "center",

} as const;



function EyeIcon() {

  return (

    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>

      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />

      <circle cx="12" cy="12" r="3" />

    </svg>

  );

}



function EyeOffIcon() {

  return (

    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>

      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-10-8-10-8a18.45 18.45 0 015.06-5.94" />

      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 10 8 10 8a18.5 18.5 0 01-2.16 3.19" />

      <path d="M1 1l22 22M14.12 14.12a3 3 0 11-4.24-4.24" />

    </svg>

  );

}



function LoginHeroBrand({ logoRef }: { logoRef: React.RefObject<HTMLElement> }) {

  const brandInitial = BRAND_NAME.charAt(0).toUpperCase();



  return (

    <header ref={logoRef as React.RefObject<HTMLHeadingElement>} className="login-hero-brand">

      <div className="login-hero-brand__logo" aria-hidden>

        {brandInitial}

      </div>

      <div className="login-hero-brand__text">

        <h1 className="login-hero-brand__name">{BRAND_NAME}</h1>

        <p className="login-hero-brand__tagline">{TAGLINE}</p>

      </div>

    </header>

  );

}



function LoginFormPanel({

  cardRef,

  fieldsRef,

  submitting,

  error,

  email,

  password,

  showPassword,

  onEmailChange,

  onPasswordChange,

  onTogglePassword,

  onSubmit,

}: {

  cardRef: React.RefObject<HTMLDivElement>;

  fieldsRef: React.RefObject<HTMLFormElement>;

  submitting: boolean;

  error: string | null;

  email: string;

  password: string;

  showPassword: boolean;

  onEmailChange: (value: string) => void;

  onPasswordChange: (value: string) => void;

  onTogglePassword: () => void;

  onSubmit: (event: FormEvent) => void;

}) {

  return (

    <div ref={cardRef} className="login-form-panel">

      <header className="login-form-header">

        <h2 className="login-form-header__title">Bienvenido de nuevo</h2>

        <p className="login-form-header__subtitle">Ingresa tus credenciales para continuar</p>

      </header>



      <form ref={fieldsRef} className="login-form" onSubmit={onSubmit} noValidate>

        <label className="login-field login-field--anim">

          <span className="login-field__label">Correo electrónico</span>

          <input

            type="email"

            name="email"

            className="login-input"

            autoComplete="email"

            required

            placeholder="nombre@restaurante.com"

            value={email}

            onChange={(e) => onEmailChange(e.target.value)}

            disabled={submitting}

          />

        </label>



        <label className="login-field login-field--anim">

          <span className="login-field__label">Contraseña</span>

          <span className="login-input-wrap">

            <input

              type={showPassword ? "text" : "password"}

              name="password"

              className="login-input login-input--password"

              autoComplete="current-password"

              required

              placeholder="••••••••"

              value={password}

              onChange={(e) => onPasswordChange(e.target.value)}

              disabled={submitting}

            />

            <button

              type="button"

              className="login-password-toggle"

              onClick={onTogglePassword}

              disabled={submitting}

              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}

            >

              {showPassword ? <EyeOffIcon /> : <EyeIcon />}

            </button>

          </span>

        </label>



        {error ? (

          <p className="login-error login-field--anim" role="alert">

            {error}

          </p>

        ) : null}



        <div className="login-submit-wrap login-field--anim">

          <button type="submit" className="login-submit" disabled={submitting}>

            {submitting ? (

              <>

                <span className="login-spinner" aria-hidden />

                <span className="sr-only">Ingresando</span>

              </>

            ) : (

              "Ingresar"

            )}

          </button>

        </div>

      </form>



      <p className="login-version login-field--anim">

        Sistema POS · Versión 1.0

      </p>

    </div>

  );

}



function useLoginEntranceTimeline(ready: boolean) {

  const logoRef = useRef<HTMLElement>(null);

  const cardRef = useRef<HTMLDivElement>(null);

  const fieldsRef = useRef<HTMLFormElement>(null);



  useEffect(() => {

    if (!ready) return;



    const logo = logoRef.current;

    const card = cardRef.current;

    const fields = fieldsRef.current?.querySelectorAll(".login-field--anim");

    if (!logo || !card) return;



    gsap.set(logo, { y: -40, opacity: 0 });

    gsap.set(card, { y: 40, opacity: 0 });

    if (fields?.length) gsap.set(fields, { y: 16, opacity: 0 });



    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

    tl.to(logo, { y: 0, opacity: 1, duration: 0.38 })

      .to(card, { y: 0, opacity: 1, duration: 0.35 }, "-=0.2")

      .to(fields ?? [], { y: 0, opacity: 1, duration: 0.3, stagger: 0.1 }, "-=0.15");



    return () => {

      tl.kill();

    };

  }, [ready]);



  return { logoRef, cardRef, fieldsRef };

}



export function LoginPage() {

  const { session, signIn, loading } = useAuth();

  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState<string | null>(null);



  const { logoRef, cardRef, fieldsRef } = useLoginEntranceTimeline(!loading && !session);



  if (!loading && session) {

    return <Navigate to="/" replace />;

  }



  async function handleSubmit(event: FormEvent) {

    event.preventDefault();

    setError(null);

    setSubmitting(true);



    try {

      await signIn(email.trim(), password);

    } catch (err) {

      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión");

    } finally {

      setSubmitting(false);

    }

  }



  const formProps = {

    cardRef,

    fieldsRef,

    submitting,

    error,

    email,

    password,

    showPassword,

    onEmailChange: setEmail,

    onPasswordChange: setPassword,

    onTogglePassword: () => setShowPassword((value) => !value),

    onSubmit: handleSubmit,

  };



  if (loading) {

    return (

      <div className="login-screen login-screen--split">

        <aside className="login-panel-left" style={loginPanelBgStyle}>

          <div className="login-panel-left__overlay" aria-hidden />

          <LoginHeroBrand logoRef={logoRef} />

        </aside>

        <section className="login-panel-right">

          <p className="login-screen__loading">Cargando sesión…</p>

        </section>

      </div>

    );

  }



  return (

    <div className="login-screen login-screen--split">

      <aside className="login-panel-left" style={loginPanelBgStyle}>

        <div className="login-panel-left__overlay" aria-hidden />

        <LoginHeroBrand logoRef={logoRef} />

      </aside>



      <section className="login-panel-right">

        <LoginFormPanel {...formProps} />

      </section>

    </div>

  );

}


