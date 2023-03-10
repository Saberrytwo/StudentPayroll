const express = require('express')
const cors = require('cors')
const bodyParser = require("body-parser");
const app = express()
const port = 3001
const sha256 = require('sha256');
var nodemailer = require('nodemailer');

var transporter = nodemailer.createTransport({
  host: "smtp-mail.outlook.com", // hostname
  secureConnection: false, // TLS requires secureConnection to be false
  port: 587, // port for secure SMTP
  tls: {
     ciphers:'SSLv3'
  },
  auth: {
      user: 'is405classproject@outlook.com',
      pass: 'blahprojectfun1234'
  }
});

// var mailOptions = {
//   from: '"Our Code World " <mymail@outlook.com>', // sender address (who sends)
//   to: 'mymail@mail.com, mymail2@mail.com', // list of receivers (who receives)
//   subject: 'Hello ', // Subject line
//   text: 'Hello world ', // plaintext body
//   html: '<b>Hello world </b><br> This is the first email sent with Nodemailer in Node.js' // html body
// };

// // send mail with defined transport object
// transporter.sendMail(mailOptions, function(error, info){
//   if(error){
//       return console.log(error);
//   }

//   console.log('Message sent: ' + info.response);
// });

app.use(cors({credentials: true, origin: 'http://52.15.82.23/'}));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const knex = require('knex')({
  client: 'mysql2',
  connection: {
    host: 'finalproject-db.cluster-cbdo9oytyewz.us-east-2.rds.amazonaws.com',
    port : 3306,
    user : 'admin',
    password : 'Password!234',
    database : 'studentemploymentdb'
  }
});

const getCurrentSemester = () => {
  const currentMonth = new Date().getMonth();

  const fallMonths = [8, 9, 10, 11]
  const winterMonths = [0, 1, 2, 3]
  const springMonths = [4, 5]

  return fallMonths.includes(currentMonth) ? 'Fall' : winterMonths.includes(currentMonth) ? 'Winter' : springMonths.includes(currentMonth) ? 'Spring' : 'Summer'
}

app.get('/', (req, res) => {
  res.send(
    '<p>some html</p>'
  )
});

app.post('/login', async (req,res) => {
  var date = new Date().toISOString().split("T")[0];
  var token = "";
  const user = await knex('Login')
    .where('username', req.body.username);
  if (user[0].password == req.body.password){
    token = sha256(date + "isemp" + req.body.username);
    res.send({token:token});
  }
});

app.get('/supervisors', async (req, res) => {
  const supervisors = await knex('Supervisor');

  res.redirect(supervisors)
})

app.get('/notifications', async (req, res) => {
  const employees = await knex('EmployeeSemesterPositionLink')
    .join('Position', 'Position.id', 'EmployeeSemesterPositionLink.positionId')
    .join('Employee', 'Employee.byuId', 'EmployeeSemesterPositionLink.employeeId')
    .join('Semester', 'Semester.id', 'EmployeeSemesterPositionLink.semesterId')
    .where('semester', getCurrentSemester())
    .where('year', new Date().getFullYear());

  const supervisors = await knex('Supervisor');

  const authorizedToWorkNotifications = await Promise.all(employees
    .filter(emp => new Date(emp.dateAdded) < (new Date().getTime() - (7 * 24 * 60 * 60 * 1000)))
    .map(emp => {
      const supervisor = supervisors.filter(sup => sup.id == emp.supervisorId).map(sup => `${sup.firstName} ${sup.lastName}`)
      return {
        name: `${emp.firstName} ${emp.lastName}`,
        position: emp.position,
        dateAdded: emp.dateAdded,
        supervisor: supervisor
      }
    }));

  const eFormNotifications = await Promise.all(employees.filter(emp => emp.qualtricsSurveySent && !emp.isEFormSubmitted)
    .map(emp => {
      const supervisor = supervisors.filter(sup => sup.id == emp.supervisorId).map(sup => `${sup.firstName} ${sup.lastName}`)
      return {
        name: `${emp.firstName} ${emp.lastName}`,
        position: emp.position,
        supervisor: supervisor
      }
    }));

  res.send({
    authorizedToWorkNotifications,
    eFormNotifications
  })
});

app.get('/get-table-data', async (req, res) => {
  const supervisors = await knex('Supervisor');
  const positions = await knex('Position');
  const years = await knex('EmployeeSemesterPositionLink').distinct().pluck('year');

  var supervisorsWithEmployees = await Promise.all(supervisors.map(async el => {
    return knex('EmployeeSemesterPositionLink')
      .join('Position', 'Position.id', 'EmployeeSemesterPositionLink.positionId')
      .join('Employee', 'Employee.byuId', 'EmployeeSemesterPositionLink.employeeId')
      .join('EmployeePayInfo', 'EmployeeSemesterPositionLink.payRateId', 'EmployeePayInfo.id')
      .join('Semester', 'Semester.id', 'EmployeeSemesterPositionLink.semesterId')
      .where('supervisorId', el.id)
      .where('semester', req.query.semester)
      .where('year', req.query.year).then(employees => {
      return {
        supervisor: {
          id: el.id,
          firstName: el.firstName,
          lastName: el.lastName
        },
        employees: employees
      }
    })
  }));

  const linkingTable = await knex('EmployeeSemesterPositionLink').join('Semester', 'Semester.id', 'EmployeeSemesterPositionLink.semesterId').where('semester', req.query.semester).where('year', req.query.year)

  const response = 
  { 
    positions: positions, 
    years: years.sort(function(a, b) {
    return b - a;
    }), 
    supervisors: supervisorsWithEmployees,
    noEmployees: !linkingTable.length
  }

  res.send(response);
});

app.get('/get-report-data', async (req, res) => {
  const employees = await knex('Employee')
    .join('EmployeeSemesterPositionLink', 'Employee.byuId', 'EmployeeSemesterPositionLink.employeeId');
  const taCount = employees.filter(emp => emp.positionId === 1).length;
  const raCount = employees.filter(emp => emp.positionId === 2).length;
  
  const positions = await knex('Position');
  const genders = await knex('Employee').distinct().pluck('gender');
  const supervisors = await knex('Supervisor');

  const overallWageAvg = await knex('EmployeePayInfo').avg('payRate as avg');
  const positionalAvg = await Promise.all(positions.map(async pos => {
    const avg = await knex('EmployeePayInfo').join('EmployeeSemesterPositionLink', 'EmployeeSemesterPositionLink.payRateId', 'EmployeePayInfo.id').avg('payRate as avg').where('positionId', pos.id)

    return ({[pos.position]: avg[0].avg})
  }));

  const overallCount= employees.length;
  const positionalCount = await Promise.all(positions.map(async pos => {
    const count = await knex('Employee').join('EmployeeSemesterPositionLink', 'EmployeeSemesterPositionLink.employeeId', 'Employee.byuId').count().where('positionId', pos.id)

    return ({[pos.position]: count[0]['count(*)']})
  }));

  const genderRatioDatasets = genders.map(gender => {
    return {
      label: gender,
      data: positions.map(pos => employees.filter(emp => emp.positionId == pos.id && emp.gender == gender).length),
      backgroundColor: gender == 'Female' ? 'rgba(255, 99, 132, 0.5)' : gender == 'Male' ? 'rgba(53, 162, 235, 0.5)' : 'rgba(133, 133, 133, 0.75)',
    }
  })

  const reportsData = {
    wageData: {
      overallAvg: overallWageAvg[0].avg,
      positionalAvg: positionalAvg
    },
    employeeCountData: {
      overallCount: overallCount,
      positionalCount: positionalCount
    },
    supervisors: supervisors,
    taRaData: {
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: true,
            text: 'TA vs RA',
          },
        },
      },
      data: {
        labels: ['TA\'s', 'RA\'s'],
        datasets: [
          {
            data: [taCount, raCount],
            backgroundColor: 'rgba(39, 245, 159, 0.5)',
          }
        ]
      }
    },
    genderRatioData: {
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: true,
            text: 'Gender Ratio',
          },
        },
      },
      data: {
        labels: positions.map(pos => pos.position),
        datasets: genderRatioDatasets
      }
    }
  }

  res.send(reportsData);
});

app.get('/employee-supervisor-csv/:supervisorId', async (req, res) => {
  var jobs = await knex('EmployeeSemesterPositionLink')
  .join('Employee', 'Employee.byuId', 'EmployeeSemesterPositionLink.employeeId')
  .join('EmployeePayInfo', 'EmployeeSemesterPositionLink.payRateId', 'EmployeePayInfo.id')
  .join('Position', 'Position.id', 'EmployeeSemesterPositionLink.positionId')
  .join('Semester', 'Semester.id', 'EmployeeSemesterPositionLink.semesterId')
  .where('supervisorId', req.params.supervisorId)

  var csvData = [];

  csvData.push(['byuId', 'firstName', 'lastName', 'position', 'semester', 'year', 'email', 'phone', 'gender', 'byuName', 'nameChangeCompleted', 'isInternational', 'isPayingGradTuition', 'notes', 'hireDate', 'expectedHours', 'employeeRecordNumber', 'payRate', 'lastPayIncrease', 'increaseInputDate', 'qualtricsSurveySent', 'isEFormSubmitted', 'eFormSubmissionDate', 'isWorkAuthorizationReceived', 'authorizedToWorkEmailDate', 'terminationDate']);
  jobs.forEach(el => {
    csvData.push([el.byuId, el.firstName, el.lastName, el.position, el.semester, el.year, el.email, el.phone, el.gender, el.byuName, el.nameChangeCompleted, el.isInternational, el.isPayingGradTuition, el.notes, el.hireDate, el.expectedHours, el.employeeRecordNumber, el.payRate, el.lastPayIncrease, el.increaseInputDate, el.qualtricsSurveySent, el.isEFormSubmitted, el.eFormSubmissionDate, el.isWorkAuthorizationReceived, el.authorizedToWorkEmailDate, el.terminationDate])
  });

  res.send({data: csvData});
});

app.get('/semester-csv', async (req, res) => {
  var jobs = await knex('EmployeeSemesterPositionLink')
  .join('Employee', 'Employee.byuId', 'EmployeeSemesterPositionLink.employeeId')
  .join('EmployeePayInfo', 'EmployeeSemesterPositionLink.payRateId', 'EmployeePayInfo.id')
  .join('Position', 'Position.id', 'EmployeeSemesterPositionLink.positionId')
  .join('Semester', 'Semester.id', 'EmployeeSemesterPositionLink.semesterId')
  .where('semester', getCurrentSemester())
  .where('year', new Date().getFullYear())

  var csvData = [];

  csvData.push(['byuId', 'firstName', 'lastName', 'position', 'semester', 'year', 'email', 'phone', 'gender', 'byuName', 'nameChangeCompleted', 'isInternational', 'isPayingGradTuition', 'notes', 'hireDate', 'expectedHours', 'employeeRecordNumber', 'payRate', 'lastPayIncrease', 'increaseInputDate', 'qualtricsSurveySent', 'isEFormSubmitted', 'eFormSubmissionDate', 'isWorkAuthorizationReceived', 'authorizedToWorkEmailDate', 'terminationDate']);
  jobs.forEach(el => {
    csvData.push([el.byuId, el.firstName, el.lastName, el.position, el.semester, el.year, el.email, el.phone, el.gender, el.byuName, el.nameChangeCompleted, el.isInternational, el.isPayingGradTuition, el.notes, el.hireDate, el.expectedHours, el.employeeRecordNumber, el.payRate, el.lastPayIncrease, el.increaseInputDate, el.qualtricsSurveySent, el.isEFormSubmitted, el.eFormSubmissionDate, el.isWorkAuthorizationReceived, el.authorizedToWorkEmailDate, el.terminationDate])
  });

  res.send({data: csvData});
});

app.get('/all-employee-csv', async (req, res) => {
  var jobs = await knex('EmployeeSemesterPositionLink')
  .join('Employee', 'Employee.byuId', 'EmployeeSemesterPositionLink.employeeId')
  .join('EmployeePayInfo', 'EmployeeSemesterPositionLink.payRateId', 'EmployeePayInfo.id')
  .join('Position', 'Position.id', 'EmployeeSemesterPositionLink.positionId')
  .join('Semester', 'Semester.id', 'EmployeeSemesterPositionLink.semesterId')

  var csvData = [];

  csvData.push(['byuId', 'firstName', 'lastName', 'position', 'semester', 'year', 'email', 'phone', 'gender', 'byuName', 'nameChangeCompleted', 'isInternational', 'isPayingGradTuition', 'notes', 'hireDate', 'expectedHours', 'employeeRecordNumber', 'payRate', 'lastPayIncrease', 'increaseInputDate', 'qualtricsSurveySent', 'isEFormSubmitted', 'eFormSubmissionDate', 'isWorkAuthorizationReceived', 'authorizedToWorkEmailDate', 'terminationDate']);
  jobs.forEach(el => {
    csvData.push([el.byuId, el.firstName, el.lastName, el.position, el.semester, el.year, el.email, el.phone, el.gender, el.byuName, el.nameChangeCompleted, el.isInternational, el.isPayingGradTuition, el.notes, el.hireDate, el.expectedHours, el.employeeRecordNumber, el.payRate, el.lastPayIncrease, el.increaseInputDate, el.qualtricsSurveySent, el.isEFormSubmitted, el.eFormSubmissionDate, el.isWorkAuthorizationReceived, el.authorizedToWorkEmailDate, el.terminationDate])
  });

  res.send({data: csvData});
});

app.get('/reminder-data', async (req, res) => {
  const work_auth = await knex('Reminders').where('reminder_type', 'work_auth');
  const eform = await knex('Reminders').where('reminder_type', 'e-form');
  
  res.send({
    work_auth: work_auth[0].num_days,
    eform: eform[0].num_days
  })
})

app.get('/email', (req, res) => {
  knex('Email')
    .where('email_name', 'work-approval')
    .then(resp => {
      res.send(resp);
    })
})

app.post('/update-email', (req, res) => {
  knex('Email')
    .where('email_name', 'work-approval')
    .update({
      'content': req.body.content
    }).then(resp => {
      res.status(200); res.send();
    })
})

app.post('/update-work-auth', async (req, res) => {
  await knex('Reminders')
    .where('reminder_type', 'work_auth')
    .update('num_days', req.body.work_auth);

  res.status(200); res.send();
})

app.post('/update-e-form', async (req, res) => {
  await knex('Reminders')
    .where('reminder_type', 'e-form')
    .update('num_days', req.body.eform);

  res.status(200); res.send();
})

app.post('/update-row', (req, res) => {
  knex('EmployeeSemesterPositionLink')
      .join('Employee', 'Employee.byuId', 'EmployeeSemesterPositionLink.employeeId')
      .join('EmployeePayInfo', 'EmployeeSemesterPositionLink.payRateId', 'EmployeePayInfo.id')
  .where('byuId', req.body.byuId)
  .update({
    [req.body.column]: req.body.value
  }).then(async result => { 

    res.status(200); res.send(); 
  })
});

app.post('/add-employee-data', async (req, res) => {
  knex('Employee')
  .insert({
    byuId: req.body.byuId,
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    isInternational: req.body.isInternational,
    gender: req.body.gender,
    byuName: req.body.byuName,
    email: req.body.email,
    expectedHours: req.body.expectedHours,
    phone: req.body.phone,
    hireDate: req.body.hireDate,
    nameChangeCompleted: req.body.nameChangeCompleted,
    isPayingGradTuition: req.body.isPayingGradTuition,
    notes: req.body.notes,
    employeeRecordNumber: 0
  })
  .then(response => {
    knex('EmployeePayInfo')
    .insert({
      payRate: req.body.payRate
    }, ['id'])
    .then(async resp => {
      var semester = await knex('Semester').where('semester', req.body.semester).pluck('id');
      knex('EmployeeSemesterPositionLink')
      .insert({
        employeeId: req.body.byuId,
        supervisorId: req.body.supervisorId,
        semesterId: semester,
        year: req.body.year,
        positionId: req.body.position,
        payRateId: resp[0],
        dateAdded: new Date().toISOString().split('T')[0]
      }, '').then(response => {
        res.status(200).send({ 'status': 'ok' });
      })
    })
  })
})

app.post('/delete/:id', async (req, res) => {
  knex('EmployeeSemesterPositionLink')
    .join('Employee', 'Employee.byuId', 'EmployeeSemesterPositionLink.employeeId')
    .join('EmployeePayInfo', 'EmployeeSemesterPositionLink.payRateId', 'EmployeePayInfo.id')
  .where('byuId', req.params['id'])
  .del().then(result => {
    res.status(200).send({ 'status': 'ok' });
  })
})

app.listen(port, () => {
  console.log(`App listening on port ${port}`)
})
// https.createServer(https_options, app).listen(port,() => {
//   console.log('Server listening on port ' + port);
// });

